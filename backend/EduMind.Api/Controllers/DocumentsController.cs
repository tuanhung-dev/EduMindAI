using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

using EduMind.Api.Data;
using EduMind.Api.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace EduMind.Api.Controllers;

[ApiController]
[Authorize]
[Route("api/documents")]
public class DocumentsController : ControllerBase
{
    private string CurrentUserId => User.FindFirstValue(ClaimTypes.NameIdentifier)!;
    private bool IsAdmin => User.IsInRole("Admin");
    private const long MaxPdfSize = 10 * 1024 * 1024;

    private readonly EduMindDbContext _db;
    private readonly IWebHostEnvironment _environment;

    public DocumentsController(
        EduMindDbContext db,
        IWebHostEnvironment environment)
    {
        _db = db;
        _environment = environment;
    }

    // ========================================
    // 1. GET /api/documents
    // Lay danh sach tai lieu
    // ========================================

    [HttpGet]
    public async Task<IActionResult> GetAll(
        CancellationToken cancellationToken)
    {
        if (!_environment.IsDevelopment())
        {
            return StatusCode(
                403,
                "API chi duoc su dung trong Development."
            );
        }

        var documents = await _db.Documents
            .AsNoTracking()
            .Where(d => d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null))
            .OrderByDescending(d => d.CreatedAtUtc)
            .Select(d => new
            {
                d.Id,
                d.SubjectId,
                d.OriginalFileName,
                d.SizeBytes,
                d.Status,
                d.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(documents);
    }

    // ========================================
    // 2. POST /api/documents
    // Upload tai lieu PDF
    // ========================================

    [HttpPost]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(12 * 1024 * 1024)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile? file,
        [FromForm] int subjectId,
        CancellationToken cancellationToken)
    {
        if (!_environment.IsDevelopment())
        {
            return StatusCode(
                403,
                "API chi duoc su dung trong Development."
            );
        }

        // Kiem tra file
        if (file == null || file.Length == 0)
        {
            return BadRequest("Vui long chon file PDF.");
        }

        if (file.Length > MaxPdfSize)
        {
            return BadRequest("File khong duoc qua 10 MB.");
        }

        string originalName =
            Path.GetFileName(file.FileName);

        if (string.IsNullOrWhiteSpace(originalName) ||
            originalName.Length > 255 ||
            !string.Equals(
                Path.GetExtension(originalName),
                ".pdf",
                StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Chi chap nhan file PDF.");
        }

        // Kiem tra mon hoc
        bool subjectExists = await _db.Subjects
            .AnyAsync(
                s => s.Id == subjectId && s.IsActive,
                cancellationToken);

        if (!subjectExists)
        {
            return BadRequest(
                "Mon hoc khong ton tai hoac khong hoat dong."
            );
        }

        // Kiem tra 5 byte dau cua PDF
        if (file.Length < 5)
        {
            return BadRequest("File PDF khong hop le.");
        }

        await using var input = file.OpenReadStream();

        byte[] signature = new byte[5];

        await input.ReadExactlyAsync(
            signature.AsMemory(),
            cancellationToken);

        string signatureText =
            System.Text.Encoding.ASCII.GetString(signature);

        if (signatureText != "%PDF-")
        {
            return BadRequest(
                "Noi dung file khong phai PDF hop le."
            );
        }

        // Tao thu muc luu PDF
        string storageFolder = Path.Combine(
            _environment.ContentRootPath,
            "Storage",
            "Documents");

        Directory.CreateDirectory(storageFolder);

        // Tao ten ngau nhien de tranh trung file
        string storedFileName =
            $"{Guid.NewGuid():N}.pdf";

        string filePath = Path.Combine(
            storageFolder,
            storedFileName);

        try
        {
            // Luu file vao o dia
            await using (var output = new FileStream(
                filePath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                81920,
                useAsync: true))
            {
                await output.WriteAsync(
                    signature.AsMemory(),
                    cancellationToken);

                await input.CopyToAsync(
                    output,
                    cancellationToken);
            }

            // Luu thong tin vao MySQL
            var document = new Document
            {
                SubjectId = subjectId,
                OwnerUserId = CurrentUserId,
                OriginalFileName = originalName,
                StoredFileName = storedFileName,
                ContentType = "application/pdf",
                SizeBytes = file.Length,
                Status = "Uploaded",
                CreatedAtUtc = DateTime.UtcNow
            };

            _db.Documents.Add(document);

            await _db.SaveChangesAsync(
                cancellationToken);

            return StatusCode(201, new
            {
                document.Id,
                document.SubjectId,
                document.OriginalFileName,
                document.SizeBytes,
                document.Status,
                document.CreatedAtUtc
            });
        }
        catch
        {
            // Neu luu database loi, xoa file vua tao
            if (System.IO.File.Exists(filePath))
            {
                System.IO.File.Delete(filePath);
            }

            throw;
        }
    }
    
    // =========================================
    // 3. GET /api/documents/{id}/file
    // Xem file PDF tren trinh duyet
    // =========================================

    [HttpGet("{id:int}/file")]
    public async Task<IActionResult> ViewFile(
        int id,
        CancellationToken cancellationToken)
    {
        // Chi cho phep trong moi truong Development
        if (!_environment.IsDevelopment())
        {
            return StatusCode(
                403,
                "API chi hoat dong trong Development."
            );
        }

        // 1. Tim thong tin tai lieu trong MySQL
        var document = await _db.Documents
            .AsNoTracking()
            .FirstOrDefaultAsync(
                d => d.Id == id && (d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null)),
                cancellationToken);

        if (document == null)
        {
            return NotFound(
                "Khong tim thay tai lieu trong database."
            );
        }

        // 2. Lay ten file da luu
        string storedFileName = document.StoredFileName;

        // 3. Kiem tra ten file an toan
        if (string.IsNullOrWhiteSpace(storedFileName) ||
            Path.GetFileName(storedFileName) != storedFileName ||
            !Guid.TryParseExact(
                Path.GetFileNameWithoutExtension(storedFileName),
                "N",
                out _) ||
            !string.Equals(
                Path.GetExtension(storedFileName),
                ".pdf",
                StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(
                "Ten file luu tru khong hop le."
            );
        }

        // 4. Xac dinh duong dan file PDF
        string filePath = Path.Combine(
            _environment.ContentRootPath,
            "Storage",
            "Documents",
            storedFileName);

        // 5. Kiem tra file co ton tai khong
        if (!System.IO.File.Exists(filePath))
        {
            return NotFound(
                "File PDF khong ton tai tren may chu."
            );
        }

        // 6. Tra file PDF ve trinh duyet
        return PhysicalFile(
            filePath,
            "application/pdf",
            enableRangeProcessing: true);
    }


    // =========================================
    // GET /api/documents/{id}/text
    // Trich xuat noi dung PDF theo tung trang
    // =========================================

    [HttpGet("{id:int}/text")]
    public async Task<IActionResult> ExtractText(
        int id,
        CancellationToken cancellationToken)
    {
        // 1. Chi cho phep trong moi truong Development
        if (!_environment.IsDevelopment())
        {
            return StatusCode(
                403,
                "API chi duoc su dung trong Development."
            );
        }

        // 2. Tim tai lieu theo ID trong MySQL
        var document = await _db.Documents
            .AsNoTracking()
            .FirstOrDefaultAsync(
                d => d.Id == id && (d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null)),
                cancellationToken);

        if (document == null)
        {
            return NotFound(
                "Khong tim thay tai lieu trong MySQL."
            );
        }

        // 3. Kiem tra ten file da luu
        string storedName = document.StoredFileName;

        if (string.IsNullOrWhiteSpace(storedName) ||
            Path.GetFileName(storedName) != storedName ||
            !Guid.TryParseExact(
                Path.GetFileNameWithoutExtension(storedName),
                "N",
                out _) ||
            !string.Equals(
                Path.GetExtension(storedName),
                ".pdf",
                StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(
                "Ten file luu tru khong hop le."
            );
        }

        // 4. Xac dinh duong dan PDF
        string filePath = Path.Combine(
            _environment.ContentRootPath,
            "Storage",
            "Documents",
            storedName);

        if (!System.IO.File.Exists(filePath))
        {
            return NotFound(
                "File PDF khong ton tai tren may chu."
            );
        }

        try
        {
            // 5. Mo tai lieu PDF
            using var pdf = PdfDocument.Open(filePath);

            // Giai doan thu nghiem: doc toi da 5 trang
            int pageLimit = Math.Min(pdf.NumberOfPages, 5);

            var pages = new List<object>();

            bool hasExtractableText = false;

            // 6. Doc noi dung theo tung trang
            for (int pageNumber = 1;
                 pageNumber <= pageLimit;
                 pageNumber++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var page = pdf.GetPage(pageNumber);

                string text =
                    ContentOrderTextExtractor.GetText(page);

                if (!string.IsNullOrWhiteSpace(text))
                {
                    hasExtractableText = true;
                }

                // Chi tra ve toi da 5000 ky tu/trang
                // de tranh JSON qua dai khi thu nghiem
                if (text.Length > 5000)
                {
                    text = text[..5000];
                }

                pages.Add(new
                {
                    pageNumber,
                    text
                });
            }

            // 7. Tra ket qua JSON
            return Ok(new
            {
                documentId = document.Id,
                fileName = document.OriginalFileName,
                totalPages = pdf.NumberOfPages,
                extractedPages = pageLimit,
                hasExtractableText,
                pages
            });
        }
        catch (Exception ex)
            when (ex is not OperationCanceledException)
        {
            return UnprocessableEntity(new
            {
                message = "Khong the trich xuat PDF.",
                detail = ex.Message
            });
        }
    }


    // POST /api/documents/{id}/index
    // Doc PDF va luu cac doan van ban vao MySQL

    [HttpPost("{id:int}/index")]
    public async Task<IActionResult> IndexDocument(
        int id,
        CancellationToken cancellationToken)
    {
        if (!_environment.IsDevelopment())
            return StatusCode(403, "Development only.");

        var document = await _db.Documents
            .FirstOrDefaultAsync(
                d => d.Id == id && (d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null)),
                cancellationToken);

        if (document == null)
            return NotFound("Khong tim thay tai lieu.");

        string storedName = document.StoredFileName;

        if (string.IsNullOrWhiteSpace(storedName) ||
            Path.GetFileName(storedName) != storedName ||
            !Guid.TryParseExact(
                Path.GetFileNameWithoutExtension(storedName),
                "N",
                out _) ||
            !string.Equals(
                Path.GetExtension(storedName),
                ".pdf",
                StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest("Ten file khong hop le.");
        }

        string filePath = Path.Combine(
            _environment.ContentRootPath,
            "Storage",
            "Documents",
            storedName);

        if (!System.IO.File.Exists(filePath))
            return NotFound("File PDF khong ton tai.");

        var chunks = new List<DocumentChunk>();
        int totalPages;

        try
        {
            using var pdf = PdfDocument.Open(filePath);

            totalPages = pdf.NumberOfPages;

            // Gioi han 50 trang cho ban demo
            if (totalPages > 50)
            {
                return BadRequest(
                    "Ban demo chi xu ly toi da 50 trang.");
            }

            const int chunkSize = 1800;
            const int overlap = 200;

            int chunkIndex = 0;

            for (int pageNumber = 1;
                 pageNumber <= totalPages;
                 pageNumber++)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var page = pdf.GetPage(pageNumber);

                string text = ContentOrderTextExtractor
                    .GetText(page)
                    .Trim();

                if (string.IsNullOrWhiteSpace(text))
                    continue;

                // Gioi han de tranh xu ly PDF qua lon
                if (text.Length > 40000)
                {
                    return BadRequest(
                        $"Trang {pageNumber} co qua nhieu van ban.");
                }

                for (int start = 0;
                     start < text.Length;
                     start += chunkSize - overlap)
                {
                    int length = Math.Min(
                        chunkSize,
                        text.Length - start);

                    string content = text.Substring(
                        start,
                        length);

                    chunks.Add(new DocumentChunk
                    {
                        DocumentId = id,
                        PageNumber = pageNumber,
                        ChunkIndex = chunkIndex++,
                        Content = content,
                        CreatedAtUtc = DateTime.UtcNow
                    });

                    if (start + length >= text.Length)
                        break;
                }
            }
        }
        catch (Exception ex)
            when (ex is not OperationCanceledException)
        {
            return UnprocessableEntity(
                "Khong the doc noi dung PDF.");
        }

        if (chunks.Count == 0)
        {
            return UnprocessableEntity(
                "PDF khong co van ban de trich xuat. " +
                "Co the tai lieu la ban scan.");
        }

        // Dung transaction de thay the du lieu cu an toan
        await using var transaction =
            await _db.Database.BeginTransactionAsync(
                cancellationToken);

        var oldChunks = await _db.DocumentChunks
            .Where(c => c.DocumentId == id)
            .ToListAsync(cancellationToken);

        _db.DocumentChunks.RemoveRange(oldChunks);

        await _db.SaveChangesAsync(cancellationToken);

        _db.DocumentChunks.AddRange(chunks);

        document.Status = "Ready";

        await _db.SaveChangesAsync(cancellationToken);

        await transaction.CommitAsync(cancellationToken);

        return Ok(new
        {
            documentId = id,
            totalPages,
            chunkCount = chunks.Count,
            status = document.Status,
            message = "Xu ly PDF thanh cong."
        });
    }



    // GET /api/documents/{id}/chunks

    [HttpGet("{id:int}/chunks")]
    public async Task<IActionResult> GetChunks(
        int id,
        CancellationToken cancellationToken)
    {
        if (!_environment.IsDevelopment())
            return StatusCode(403, "Development only.");

        bool exists = await _db.Documents
            .AnyAsync(
                d => d.Id == id && (d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null)),
                cancellationToken);

        if (!exists)
            return NotFound("Khong tim thay tai lieu.");

        var chunks = await _db.DocumentChunks
            .AsNoTracking()
            .Where(c => c.DocumentId == id)
            .OrderBy(c => c.ChunkIndex)
            .Select(c => new
            {
                c.Id,
                c.PageNumber,
                c.ChunkIndex,
                c.Content
            })
            .ToListAsync(cancellationToken);

        return Ok(new
        {
            documentId = id,
            totalChunks = chunks.Count,
            chunks
        });
    }

}
