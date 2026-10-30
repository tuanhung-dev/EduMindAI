using EduMind.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EduMind.Api.Services;

/// <summary>
/// Single-instance worker. Durable queue state is stored in Documents.Status.
/// On restart, unfinished Processing documents are requeued. No migration required.
/// DO NOT run several backend replicas without adding a distributed claim/lease.
/// </summary>
public sealed class DocumentIndexWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<DocumentIndexWorker> _logger;
    public DocumentIndexWorker(IServiceScopeFactory scopes, ILogger<DocumentIndexWorker> logger)
    { _scopes = scopes; _logger = logger; }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        bool recovered = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<EduMindDbContext>();
                if (!recovered)
                {
                    // A process crash can leave Processing jobs behind.
                    var interrupted = await db.Documents.Where(d => d.Status == "Processing")
                        .ToListAsync(stoppingToken);
                    foreach (var d in interrupted) d.Status = "Queued";
                    await db.SaveChangesAsync(stoppingToken);
                    recovered = true;
                }
                var job = await db.Documents.Where(d => d.Status == "Queued")
                    .OrderBy(d => d.Id).FirstOrDefaultAsync(stoppingToken);
                if (job != null)
                {
                    job.Status = "Processing";
                    await db.SaveChangesAsync(stoppingToken);
                    try
                    {
                        var indexer = scope.ServiceProvider.GetRequiredService<DocumentIndexingService>();
                        await indexer.IndexAsync(job.Id, stoppingToken);
                        _logger.LogInformation("Indexed document {DocumentId}", job.Id);
                    }
                    catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
                    { break; } // Restart recovery will requeue this document.
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Indexing failed for document {DocumentId}", job.Id);
                        // A failed re-index must not erase already indexed old chunks.
                        db.ChangeTracker.Clear();
                        var failed = await db.Documents.FirstOrDefaultAsync(d => d.Id == job.Id, stoppingToken);
                        if (failed != null)
                        {
                            bool hasPrevious = await db.DocumentChunks.AnyAsync(c => c.DocumentId == job.Id, stoppingToken);
                            failed.Status = hasPrevious ? "Ready" : "Failed";
                            await db.SaveChangesAsync(stoppingToken);
                        }
                    }
                }
                else await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background index worker will retry.");
                try { await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken); }
                catch (OperationCanceledException) { break; }
            }
        }
    }
}
