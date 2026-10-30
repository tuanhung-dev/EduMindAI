using System.IO.Compression;
using System.Diagnostics;
using System.ComponentModel;
using System.Text;
using System.Xml;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace EduMind.Api.Services;

// PageNumber means a real PDF page; for Word it means a virtual TEXT SECTION,
// never a physical Word page (Word pagination depends on the renderer).
public sealed record DocumentTextPart(int Number, string Text);
public sealed record DocumentTextResult(int TotalParts, IReadOnlyList<DocumentTextPart> Parts);

public static class DocumentContentReader
{
    public static bool IsWord(string name) =>
        Path.GetExtension(name).Equals(".docx", StringComparison.OrdinalIgnoreCase);

    public static bool IsSupported(string name) => IsWord(name) ||
        Path.GetExtension(name).Equals(".pdf", StringComparison.OrdinalIgnoreCase);

    public static void ValidateDocx(string path)
    {
        // Validate the ZIP package without extracting arbitrary ZIP entries to disk.
        using var zip = ZipFile.OpenRead(path);
        if (zip.Entries.Count > 2000 || zip.Entries.Any(e => e.FullName.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase)))
            throw new InvalidDataException("Word package is not supported.");
        var body = zip.GetEntry("word/document.xml");
        if (body is null || body.Length == 0 || body.Length > 8 * 1024 * 1024)
            throw new InvalidDataException("Word document body is missing or too large.");
        // Reading XML also detects a broken or fake DOCX early, before adding DB record.
        ReadWordXml(body, maxChars: 2_000_000);
    }

    public static DocumentTextResult Read(string path, bool word, int? maxParts = null, CancellationToken ct = default)
    {
        if (word)
        {
            using var zip = ZipFile.OpenRead(path);
            if (zip.Entries.Count > 2000 || zip.Entries.Any(e => e.FullName.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase)))
                throw new InvalidDataException("Invalid Word archive.");
            var entry = zip.GetEntry("word/document.xml");
            if (entry is null || entry.Length > 8 * 1024 * 1024)
                throw new InvalidDataException("Word document is invalid or too large.");
            var text = ReadWordXml(entry, 2_000_000);
            if (string.IsNullOrWhiteSpace(text)) return new(0, Array.Empty<DocumentTextPart>());
            // Virtual Word sections ~10K characters, not fabricated page numbers.
            const int sectionSize = 10_000;
            var count = (text.Length + sectionSize - 1) / sectionSize;
            var limit = Math.Min(count, maxParts ?? count);
            var parts = Enumerable.Range(0, limit)
                .Select(i => new DocumentTextPart(i + 1, text.Substring(i * sectionSize, Math.Min(sectionSize, text.Length - i * sectionSize))))
                .ToArray();
            return new(count, parts);
        }

        using var pdf = PdfDocument.Open(path);
        // Read complete books (up to 400 pages) in order. No silent first-50-page clipping.
        if (pdf.NumberOfPages > 400 && !maxParts.HasValue)
            throw new InvalidDataException("PDF vượt 400 trang; hãy chia thành nhiều tài liệu nhỏ.");
        var pageLimit = Math.Min(pdf.NumberOfPages, maxParts ?? pdf.NumberOfPages);
        var pages = new List<DocumentTextPart>();
        int ocrCount = 0;
        // Opt-in avoids regressing ordinary PDFs that contain blank/title pages.
        bool enableOcr = string.Equals(Environment.GetEnvironmentVariable("EDUMIND_OCR_ENABLED"),
            "true", StringComparison.OrdinalIgnoreCase);
        int maxOcr = int.TryParse(Environment.GetEnvironmentVariable("EDUMIND_OCR_MAX_PAGES"), out int cap)
            ? Math.Clamp(cap, 1, 400) : 40;
        for (int n = 1; n <= pageLimit; n++)
        {
            ct.ThrowIfCancellationRequested();
            var text = ContentOrderTextExtractor.GetText(pdf.GetPage(n)).Trim();
            if (text.Length < 30 && enableOcr)
            {
                if (++ocrCount > maxOcr)
                    throw new InvalidDataException($"PDF có quá {maxOcr} trang cần OCR. Tăng EDUMIND_OCR_MAX_PAGES hoặc chia PDF.");
                text = OcrPage(path, n, ct);
            }
            if (text.Length > 40_000)
                throw new InvalidDataException($"Trang {n} co qua nhieu van ban.");
            pages.Add(new(n, text));
        }
        return new(pdf.NumberOfPages, pages);
    }

    private static string ReadWordXml(ZipArchiveEntry entry, int maxChars)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            XmlResolver = null,
            MaxCharactersInDocument = 25_000_000,
            IgnoreComments = true
        };
        using var stream = entry.Open();
        using var reader = XmlReader.Create(stream, settings);
        const string ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
        var output = new StringBuilder();
        while (!reader.EOF)
        {
            if (reader.NodeType == XmlNodeType.Element && reader.NamespaceURI == ns && reader.LocalName == "t")
            {
                output.Append(reader.ReadElementContentAsString());
            }
            else
            {
                if (reader.NodeType == XmlNodeType.Element && reader.NamespaceURI == ns)
                {
                    if (reader.LocalName == "tab") output.Append(' ');
                    else if (reader.LocalName is "br" or "cr") output.Append('\n');
                }
                else if (reader.NodeType == XmlNodeType.EndElement && reader.NamespaceURI == ns && reader.LocalName == "p")
                    output.Append('\n');
                reader.Read();
            }
            if (output.Length > maxChars)
                throw new InvalidDataException("Word exceeds allowed text extraction length.");
        }
        return output.ToString().Trim();
    }
    // Optional local OCR: requires Poppler pdftoppm.exe and Tesseract.exe on PATH.
    // No user-controlled shell command is invoked (ArgumentList, UseShellExecute=false).
    private static string OcrPage(string path, int page, CancellationToken ct)
    {
        var folder = Path.Combine(Path.GetTempPath(), "edumind-ocr-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(folder);
        string prefix = Path.Combine(folder, "page");
        try
        {
            RunTool("pdftoppm", ["-f", page.ToString(), "-l", page.ToString(),
                "-singlefile", "-r", "140", "-png", path, prefix], ct);
            string image = prefix + ".png";
            if (!File.Exists(image) || new FileInfo(image).Length > 40 * 1024 * 1024)
                throw new InvalidDataException("Không thể tạo ảnh OCR an toàn từ PDF.");
            var text = RunTool("tesseract", [image, "stdout", "-l", "vie+eng"], ct);
            return text.Trim();
        }
        finally
        {
            try { Directory.Delete(folder, recursive: true); } catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
    }

    private static string RunTool(string executable, string[] arguments, CancellationToken ct)
    {
        var psi = new ProcessStartInfo(executable) {
            UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true
        };
        foreach (string argument in arguments) psi.ArgumentList.Add(argument);
        try
        {
            using var process = Process.Start(psi)
                ?? throw new InvalidDataException("Không chạy được công cụ OCR.");
            using var reg = ct.Register(() => { try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch { } });
            // Drain both streams concurrently; never wait with full stderr pipes.
            var stdout = process.StandardOutput.ReadToEndAsync(ct);
            var stderr = process.StandardError.ReadToEndAsync(ct);
            if (!process.WaitForExit(90_000)) {
                process.Kill(entireProcessTree: true);
                throw new InvalidDataException("OCR quá thời gian cho phép (90 giây/trang).");
            }
            ct.ThrowIfCancellationRequested();
            var output = stdout.GetAwaiter().GetResult();
            var error = stderr.GetAwaiter().GetResult();
            if (process.ExitCode != 0)
                throw new InvalidDataException($"{executable} OCR thất bại: hãy kiểm tra Poppler và dữ liệu ngôn ngữ vie+eng.");
            if (output.Length > 250_000) throw new InvalidDataException("OCR trả về quá nhiều ký tự.");
            return output;
        }
        catch (Win32Exception)
        {
            throw new InvalidDataException($"Thiếu công cụ '{executable}' trong PATH. Hãy cài Poppler và Tesseract (vie+eng) hoặc dùng PDF có thể chọn chữ.");
        }
    }

}
