using EduMind.Api.Data;
using EduMind.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Services;

public sealed record IndexOutcome(int DocumentId, int TotalPages, int ChunkCount, string Unit);

/// <summary>Single source of truth for sync + background indexing, transactional replacement.</summary>
public sealed class DocumentIndexingService
{
    // Laptop-friendly global cap: do not parse/OCR two large books at once.
    private static readonly SemaphoreSlim IndexLock = new(1, 1);
    private readonly EduMindDbContext _db;
    private readonly IWebHostEnvironment _env;
    public DocumentIndexingService(EduMindDbContext db, IWebHostEnvironment env)
    { _db = db; _env = env; }

    public static bool ValidStoredName(string? name) =>
        !string.IsNullOrWhiteSpace(name) &&
        Path.GetFileName(name) == name &&
        Guid.TryParseExact(Path.GetFileNameWithoutExtension(name), "N", out _) &&
        DocumentContentReader.IsSupported(name);

    public async Task<IndexOutcome> IndexAsync(int id, CancellationToken ct)
    {
        await IndexLock.WaitAsync(ct);
        try
        {
        var document = await _db.Documents.FirstOrDefaultAsync(x => x.Id == id, ct)
            ?? throw new InvalidDataException("Document does not exist.");
        if (!ValidStoredName(document.StoredFileName))
            throw new InvalidDataException("Invalid stored document name.");
        var file = Path.Combine(_env.ContentRootPath, "Storage", "Documents", document.StoredFileName);
        if (!File.Exists(file)) throw new FileNotFoundException("Document file is missing.");
        bool word = DocumentContentReader.IsWord(document.StoredFileName);
        var content = DocumentContentReader.Read(file, word, ct: ct);
        const int size = 1800;
        const int overlap = 200;
        var chunks = new List<DocumentChunk>();
        foreach (var part in content.Parts)
        {
            ct.ThrowIfCancellationRequested();
            var text = part.Text.Trim();
            if (string.IsNullOrWhiteSpace(text)) continue;
            for (int start = 0; start < text.Length; start += size - overlap)
            {
                var length = Math.Min(size, text.Length - start);
                if (chunks.Count >= 25_000)
                    throw new InvalidDataException("Too many text chunks; split the document.");
                chunks.Add(new DocumentChunk
                {
                    DocumentId = id, PageNumber = part.Number,
                    ChunkIndex = chunks.Count, Content = text.Substring(start, length),
                    CreatedAtUtc = DateTime.UtcNow
                });
                if (start + length == text.Length) break;
            }
        }
        if (chunks.Count == 0)
            throw new InvalidDataException("No readable text found. Enable OCR for scanned PDF.");

        // Prior chunks are intact until the complete replacement commits.
        await using var transaction = await _db.Database.BeginTransactionAsync(ct);
        var old = await _db.DocumentChunks.Where(c => c.DocumentId == id).ToListAsync(ct);
        _db.DocumentChunks.RemoveRange(old);
        await _db.SaveChangesAsync(ct);
        _db.DocumentChunks.AddRange(chunks);
        document.Status = "Ready";
        await _db.SaveChangesAsync(ct);
        await transaction.CommitAsync(ct);
        return new IndexOutcome(id, content.TotalParts, chunks.Count, word ? "section" : "page");
        }
        finally { IndexLock.Release(); }
    }
}
