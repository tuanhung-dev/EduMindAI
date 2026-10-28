using System.IO.Compression;
using UglyToad.PdfPig;

namespace EduMind.Api.Services;

/// <summary>Validate the SAVED bytes, not the user-supplied extension or MIME type.</summary>
public static class DocumentUploadGuard
{
    public const long MaxBytes = 30L * 1024 * 1024;
    private const long MaxExpandedBytes = 100L * 1024 * 1024;
    private const int MaxZipEntries = 2000;

    public static void ValidateSavedFile(string path, bool word)
    {
        var file = new FileInfo(path);
        if (!file.Exists || file.Length < 8 || file.Length > MaxBytes)
            throw new InvalidDataException("Invalid document size.");

        using (var stream = file.OpenRead())
        {
            Span<byte> bytes = stackalloc byte[5];
            stream.ReadExactly(bytes);
            if (word)
            {
                if (bytes[0] != 0x50 || bytes[1] != 0x4B || bytes[2] != 3 || bytes[3] != 4)
                    throw new InvalidDataException("Not a DOCX ZIP package.");
            }
            else if (!bytes.SequenceEqual("%PDF-"u8))
                throw new InvalidDataException("Not a PDF document.");
        }

        if (word)
        {
            using var zip = ZipFile.OpenRead(path);
            if (zip.Entries.Count is 0 or > MaxZipEntries)
                throw new InvalidDataException("Too many DOCX archive entries.");
            long expanded = 0;
            foreach (var entry in zip.Entries)
            {
                var name = entry.FullName.Replace('\\', '/');
                if (name.StartsWith('/') || name.Contains("../", StringComparison.Ordinal) ||
                    name.Contains(':') || name.Split('/').Any(s => s == "..") ||
                    name.EndsWith("vbaProject.bin", StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("Unsafe DOCX archive entry.");
                expanded = checked(expanded + entry.Length);
                if (expanded > MaxExpandedBytes ||
                    (entry.Length > 1_000_000 && entry.CompressedLength < entry.Length / 200))
                    throw new InvalidDataException("DOCX expansion exceeds the safety limit.");
            }
            DocumentContentReader.ValidateDocx(path);
        }
        else
        {
            // PdfPig parses the actual file: a forged %PDF- header is not enough.
            using var pdf = PdfDocument.Open(path);
            if (pdf.NumberOfPages is < 1 or > 400)
                throw new InvalidDataException("PDF must contain 1 to 400 pages.");
        }
    }
}
