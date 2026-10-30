using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;

using EduMind.Api.Data;
using EduMind.Api.Models;
using EduMind.Api.Services;
using Microsoft.AspNetCore.RateLimiting;
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
    private const long MaxDocumentSize = 30 * 1024 * 1024;

    private readonly EduMindDbContext _db;
    private readonly IWebHostEnvironment _environment;
    private readonly LearningApiAccess _learningAccess;
    private readonly ILogger<DocumentsController> _logger;
    private readonly DocumentIndexingService _indexer;

    public DocumentsController(
        EduMindDbContext db,
        IWebHostEnvironment environment,
        LearningApiAccess learningAccess,
        ILogger<DocumentsController> logger,
        DocumentIndexingService indexer)
    {
        _db = db;
        _environment = environment;
        _learningAccess = learningAccess;
        _logger = logger;
        _indexer = indexer;
    }

    // ========================================
    // 1. GET /api/documents
    // Lay danh sach tai lieu
    // ========================================

    [HttpGet]
    public async Task<IActionResult> GetAll(
        CancellationToken cancellationToken)
    {
        if (!_learningAccess.Enabled)
        {
            return StatusCode(
                403,
                "Learning API chua duoc bat tren may chu."
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
    [EnableRateLimiting("pdf-write")]
    [Consumes("multipart/form-data")]
    [RequestSizeLimit(32 * 1024 * 1024)]
    public async Task<IActionResult> Upload(
        [FromForm] IFormFile? file,
        [FromForm] int subjectId,
        CancellationToken cancellationToken)
    {
        if (!_learningAccess.Enabled)
        {
            return StatusCode(
                403,
                "Learning API chua duoc bat tren may chu."
            );
        }

        // Kiem tra file
        if (file == null || file.Length == 0)
        {
            return BadRequest("Vui lòng chọn PDF hoặc Word .docx.");
        }

        if (file.Length > MaxDocumentSize)
        {
            return BadRequest("File khong duoc qua 30 MB.");
        }

        string originalName =
            Path.GetFileName(file.FileName);

        if (string.IsNullOrWhiteSpace(originalName) ||
            originalName.Length > 255 ||
            !DocumentContentReader.IsSupported(originalName))
        {
            return BadRequest("Chỉ chấp nhận PDF hoặc Word .docx (không hỗ trợ .doc cũ).");
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
        var word = DocumentContentReader.IsWord(originalName);
        if (file.Length < 5) return BadRequest("Tài liệu không hợp lệ.");
        await using var input = file.OpenReadStream();
        byte[] signature = new byte[5];
        await input.ReadExactlyAsync(signature.AsMemory(), cancellationToken);
        var validHeader = word
            ? signature[0] == 0x50 && signature[1] == 0x4B && signature[2] == 3 && signature[3] == 4
            : System.Text.Encoding.ASCII.GetString(signature) == "%PDF-";
        if (!validHeader) return BadRequest("Nội dung không phải PDF/DOCX hợp lệ.");

        // Tao thu muc luu PDF
        string storageFolder = Path.Combine(
            _environment.ContentRootPath,
            "Storage",
            "Documents");

        Directory.CreateDirectory(storageFolder);

        // Tao ten ngau nhien de tranh trung file
        string storedFileName =
            $"{Guid.NewGuid():N}{(word ? ".docx" : ".pdf")}";

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

            // Validate actual bytes AND decompression limits before writing DB metadata.
            try { DocumentUploadGuard.ValidateSavedFile(filePath, word); }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogWarning("Rejected suspicious document upload ({ErrorType})", ex.GetType().Name);
                System.IO.File.Delete(filePath);
                return BadRequest("Tệp PDF/Word không hợp lệ, quá lớn hoặc chứa cấu trúc không an toàn.");
            }

            // Luu thong tin vao MySQL
            var document = new Document
            {
                SubjectId = subjectId,
                OwnerUserId = CurrentUserId,
                OriginalFileName = originalName,
                StoredFileName = storedFileName,
                ContentType = word
                    ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    : "application/pdf",
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
        // Cho phep khi Learning API duoc bat
        if (!_learningAccess.Enabled)
        {
            return StatusCode(
                403,
                "Learning API chua duoc bat tren may chu."
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
            !DocumentContentReader.IsSupported(storedFileName))
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
            DocumentContentReader.IsWord(storedFileName)
                ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                : "application/pdf",
            enableRangeProcessing: true);
    }


    // =========================================
    // GET /api/documents/{id}/text
    // Trich xuat noi dung PDF theo tung trang
    // =========================================

    [HttpGet("{id:int}/text")]
    public async Task<IActionResult> ExtractText(int id, CancellationToken cancellationToken)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, "Learning API chưa được bật.");
        var document = await _db.Documents.AsNoTracking().FirstOrDefaultAsync(
            d => d.Id == id && (d.OwnerUserId == CurrentUserId || (IsAdmin && d.OwnerUserId != null)),
            cancellationToken);
        if (document == null) return NotFound("Không tìm thấy tài liệu.");
        if (!ValidStoredName(document.StoredFileName)) return BadRequest("Tên file không hợp lệ.");
        string path = Path.Combine(_environment.ContentRootPath, "Storage", "Documents", document.StoredFileName);
        if (!System.IO.File.Exists(path)) return NotFound("File không tồn tại.");
        try
        {
            bool word = DocumentContentReader.IsWord(document.StoredFileName);
            var result = DocumentContentReader.Read(path, word, maxParts: 5, ct: cancellationToken);
            return Ok(new
            {
                documentId = document.Id, fileName = document.OriginalFileName,
                totalPages = result.TotalParts, extractedPages = result.Parts.Count,
                unit = word ? "section" : "page",
                hasExtractableText = result.Parts.Any(x => !string.IsNullOrWhiteSpace(x.Text)),
                pages = result.Parts.Select(x => new { pageNumber = x.Number, text = x.Text.Length > 5000 ? x.Text[..5000] : x.Text })
            });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Document extraction failed for {DocumentId}", id);
            return UnprocessableEntity(new { message = "Không thể trích xuất nội dung tài liệu." });
        }
    }

    private static bool ValidStoredName(string name) =>
        !string.IsNullOrWhiteSpace(name) &&
        Path.GetFileName(name) == name &&
        Guid.TryParseExact(Path.GetFileNameWithoutExtension(name), "N", out _) &&
        DocumentContentReader.IsSupported(name);


    // Existing synchronous route stays available for older clients.
    [HttpPost("{id:int}/index")]
    [EnableRateLimiting("pdf-write")]
    public async Task<IActionResult> IndexDocument(int id, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403, "Learning API chưa được bật.");
        if (!await _db.Documents.AsNoTracking().AnyAsync(d => d.Id == id &&
            d.OwnerUserId == CurrentUserId, ct)) return NotFound();
        // Don't race with a queued/processing background re-index of the same document.
        var status = await _db.Documents.AsNoTracking().Where(d => d.Id == id)
            .Select(d => d.Status).SingleAsync(ct);
        if (status is "Queued" or "Processing") return Conflict(new { message = "Tài liệu đang được xử lý nền." });
        try
        {
            var result = await _indexer.IndexAsync(id, ct);
            return Ok(new { documentId = id, totalPages = result.TotalPages,
                chunkCount = result.ChunkCount, status = "Ready", unit = result.Unit,
                message = "Xử lý tài liệu thành công." });
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "Indexing failed for document {DocumentId}", id);
            return UnprocessableEntity(new { message = "Không thể lập chỉ mục tài liệu; kiểm tra định dạng, OCR và log Backend." });
        }
    }

    // D5: a crash-safe (single-process) DB-backed queue without a new SQL table.
    [HttpPost("{id:int}/index/background")]
    [EnableRateLimiting("pdf-write")]
    public async Task<IActionResult> EnqueueIndex(int id, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403);
        var doc = await _db.Documents.FirstOrDefaultAsync(d => d.Id == id &&
            d.OwnerUserId == CurrentUserId, ct);
        if (doc == null) return NotFound();
        if (!DocumentIndexingService.ValidStoredName(doc.StoredFileName)) return BadRequest("Tên tệp không hợp lệ.");
        if (doc.Status is not ("Queued" or "Processing"))
        {
            doc.Status = "Queued";
            await _db.SaveChangesAsync(ct);
        }
        return Accepted($"/api/documents/{id}/index/status", new { documentId = id, status = doc.Status });
    }

    [HttpGet("{id:int}/index/status")]
    public async Task<IActionResult> IndexStatus(int id, CancellationToken ct)
    {
        if (!_learningAccess.Enabled) return StatusCode(403);
        var doc = await _db.Documents.AsNoTracking()
            .Where(d => d.Id == id && d.OwnerUserId == CurrentUserId)
            .Select(d => new { d.Id, d.Status }).FirstOrDefaultAsync(ct);
        if (doc == null) return NotFound();
        var count = await _db.DocumentChunks.AsNoTracking().CountAsync(c => c.DocumentId == id, ct);
        return Ok(new { documentId = id, status = doc.Status, chunkCount = count });
    }

    // GET /api/documents/{id}/chunks

    [HttpGet("{id:int}/chunks")]
    public async Task<IActionResult> GetChunks(
        int id,
        CancellationToken cancellationToken)
    {
        if (!_learningAccess.Enabled)
            return StatusCode(403, "Learning API chua duoc bat tren may chu.");

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
