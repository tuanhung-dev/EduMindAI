using System.Globalization;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;

namespace EduMind.Api.Services;

// Keep original 4-argument constructor compatible with existing TutorLogicChecks.
public sealed record RagChunk(int Id, int PageNumber, int ChunkIndex, string Content,
    int DocumentId = 0, string DocumentName = "");
public sealed record RagResult(IReadOnlyList<RagChunk> Sources, string Method, int IndexedChunks, int TotalChunks);

public sealed class DocumentRetrievalService
{
    private readonly HttpClient _client;
    private readonly IConfiguration _configuration;
    private readonly ILogger<DocumentRetrievalService> _logger;
    private readonly IMemoryCache _cache;
    private readonly SemaphoreSlim _embeddingLock = new(1, 1);
    private static readonly HashSet<string> StopWords = new(StringComparer.Ordinal) {
        "la", "gi", "va", "cua", "trong", "cho", "toi", "hay", "cac", "mot", "ve", "nhung", "duoc", "tai", "lieu", "ban", "theo", "nay", "nao", "nhu", "the", "voi", "khi", "co", "khong", "tu", "do", "can", "biet"
    };

    public DocumentRetrievalService(HttpClient client, IConfiguration configuration,
        ILogger<DocumentRetrievalService> logger, IMemoryCache cache)
    {
        _client = client; _configuration = configuration; _logger = logger; _cache = cache;
    }

    public Task<RagResult> SearchAsync(int documentId, string question,
        IReadOnlyList<RagChunk> chunks, CancellationToken ct) =>
        SearchAcrossAsync(question, chunks, ct);

    public async Task<RagResult> SearchAcrossAsync(string question,
        IReadOnlyList<RagChunk> chunks, CancellationToken ct)
    {
        if (chunks.Count == 0) return new RagResult([], "keyword", 0, 0);
        var tokens = Tokenize(question).Where(t => !StopWords.Contains(t))
            .Distinct(StringComparer.Ordinal).Take(32).ToArray();
        if (tokens.Length == 0) tokens = Tokenize(question).Distinct().Take(32).ToArray();
        // All chunks are scanned lexically; no more 'first 1000 chunks' recall loss.
        var phrase = Normalize(question);
        var corpus = chunks.Select(c => new Candidate(c, Lexical(c.Content, tokens, phrase))).ToList();
        var lexicalSorted = corpus.Where(c => c.Lexical > 0)
            .OrderByDescending(c => c.Lexical).ThenBy(c => c.Chunk.ChunkIndex).ToList();
        var keywordSources = Diversity(lexicalSorted.Select(c => c.Chunk));
        if (!_configuration.GetValue("Rag:Embeddings:Enabled", true))
            return new RagResult(keywordSources, "keyword", 0, chunks.Count);

        int budget = Math.Clamp(_configuration.GetValue("Rag:Embeddings:CandidateLimit", 192), 32, 384);
        // BM25-like lexical shortlist + uniform coverage of all documents. A long
        // document can be scanned without embedding its entire book on each request.
        var semanticCandidates = BuildCandidates(corpus, budget);
        try
        {
            var model = _configuration["Rag:Embeddings:Model"]?.Trim();
            if (string.IsNullOrWhiteSpace(model)) model = "qwen3-embedding:0.6b";
            var vectors = await GetVectorsAsync(model, semanticCandidates, ct);
            var queryVector = (await EmbedAsync(model, [question], ct)).Single();
            double threshold = Math.Clamp(_configuration.GetValue("Rag:Embeddings:MinSimilarity", 0.46), 0.30, 0.85);
            var semantic = semanticCandidates.Select((c, i) => new
            {
                c.Chunk, c.Lexical, Sim = Cosine(queryVector, vectors[i])
            }).Where(c => c.Lexical > 0 || c.Sim >= threshold)
              .OrderByDescending(c => 0.68 * Math.Max(0, c.Sim) + 0.32 * Math.Min(1, c.Lexical / 12.0))
              .Take(30).Select(c => c.Chunk);
            // Reciprocal-rank fusion prevents one retrieval channel dominating.
            var ranking = new Dictionary<int, (RagChunk Chunk, double Score)>();
            void Add(IEnumerable<RagChunk> source, double weight)
            {
                int rank = 1;
                foreach (var c in source)
                {
                    var old = ranking.GetValueOrDefault(c.Id);
                    ranking[c.Id] = (c, old.Score + weight / (40 + rank++));
                }
            }
            Add(lexicalSorted.Take(50).Select(c => c.Chunk), 0.9);
            Add(semantic, 1.1);
            var sources = Diversity(ranking.Values.OrderByDescending(c => c.Score).Select(c => c.Chunk));
            return new RagResult(sources, "hybrid-rrf", semanticCandidates.Count, chunks.Count);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested &&
            (ex is HttpRequestException or JsonException or InvalidOperationException or TaskCanceledException))
        {
            _logger.LogWarning("Embedding unavailable ({ErrorType}); keyword fallback used.", ex.GetType().Name);
            return new RagResult(keywordSources, "keyword-fallback", semanticCandidates.Count, chunks.Count);
        }
    }

    private static List<Candidate> BuildCandidates(List<Candidate> corpus, int budget)
    {
        if (corpus.Count <= budget) return corpus;
        var chosen = new List<Candidate>();
        // Reserve a candidate from every authorized document where possible.
        foreach (var group in corpus.GroupBy(c => c.Chunk.DocumentId))
            chosen.Add(group.OrderByDescending(c => c.Lexical).First());
        chosen.AddRange(corpus.Where(c => c.Lexical > 0)
            .OrderByDescending(c => c.Lexical).Take(budget * 3 / 4));
        int strideSlots = Math.Max(1, budget - chosen.DistinctBy(c => c.Chunk.Id).Count());
        foreach (var group in corpus.GroupBy(c => c.Chunk.DocumentId))
        {
            var list = group.OrderBy(c => c.Chunk.ChunkIndex).ToList();
            int sample = Math.Max(1, strideSlots * list.Count / corpus.Count);
            for (int i = 0; i < sample; i++)
                chosen.Add(list[Math.Min(list.Count - 1, (int)((long)i * list.Count / sample))]);
        }
        return chosen.DistinctBy(c => c.Chunk.Id).Take(budget).ToList();
    }

    private async Task<float[][]> GetVectorsAsync(string model, List<Candidate> candidates, CancellationToken ct)
    {
        // Content-addressed keys invalidate automatically if the PDF is reindexed.
        var hashes = candidates.Select(c => Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes(c.Chunk.Content.Length > 1500 ? c.Chunk.Content[..1500] : c.Chunk.Content)))).ToArray();
        var output = new float[candidates.Count][];
        await _embeddingLock.WaitAsync(ct);
        try
        {
            var missing = new List<int>();
            for (int i = 0; i < output.Length; i++)
            {
                if (_cache.TryGetValue($"rag:v4:{model}:{hashes[i]}", out float[]? hit) && hit is not null)
                    output[i] = hit;
                else missing.Add(i);
            }
            foreach (var batch in missing.Chunk(8))
            {
                var inputs = batch.Select(i => candidates[i].Chunk.Content[..Math.Min(1500, candidates[i].Chunk.Content.Length)]).ToArray();
                var rows = await EmbedAsync(model, inputs, ct);
                if (rows.Length != batch.Length) throw new InvalidOperationException("Missing embedding rows.");
                for (int j = 0; j < batch.Length; j++)
                {
                    output[batch[j]] = rows[j];
                    _cache.Set($"rag:v4:{model}:{hashes[batch[j]]}", rows[j],
                        new MemoryCacheEntryOptions()
                            .SetSlidingExpiration(TimeSpan.FromHours(2))
                            .SetSize((long)rows[j].Length * sizeof(float)));
                }
            }
            return output;
        }
        finally { _embeddingLock.Release(); }
    }

    private async Task<float[][]> EmbedAsync(string model, string[] texts, CancellationToken ct)
    {
        string endpoint = (_configuration["AI:Ollama:BaseUrl"] ?? "http://127.0.0.1:11434").Trim().TrimEnd('/');
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "http" ||
            !uri.IsLoopback || uri.AbsolutePath != "/" || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new InvalidOperationException("Embedding endpoint must be local HTTP.");
        using var response = await _client.PostAsJsonAsync(endpoint + "/api/embed",
            new { model, input = texts, truncate = true, keep_alive = "30s" }, ct);
        response.EnsureSuccessStatusCode();
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(ct), cancellationToken: ct);
        if (!json.RootElement.TryGetProperty("embeddings", out var arr) || arr.ValueKind != JsonValueKind.Array || arr.GetArrayLength() != texts.Length)
            throw new InvalidOperationException("Invalid embedding response.");
        return arr.EnumerateArray().Select(row => row.EnumerateArray().Select(v => v.GetSingle()).ToArray()).ToArray();
    }

    private static RagChunk[] Diversity(IEnumerable<RagChunk> ranked)
    {
        var picked = new List<RagChunk>();
        var sourceCounts = new Dictionary<int, int>();
        var pageCounts = new Dictionary<(int, int), int>();
        var fingerprints = new HashSet<string>();
        foreach (var c in ranked)
        {
            int did = c.DocumentId;
            sourceCounts.TryGetValue(did, out var dc);
            pageCounts.TryGetValue((did, c.PageNumber), out var pc);
            string norm = Normalize(c.Content);
            string key = did + ":" + norm[..Math.Min(160, norm.Length)];
            if (dc >= 4 || pc >= 2 || !fingerprints.Add(key)) continue;
            picked.Add(c); sourceCounts[did] = dc + 1; pageCounts[(did, c.PageNumber)] = pc + 1;
            if (picked.Count >= 6) break;
        }
        return picked.ToArray();
    }

    private static double Cosine(float[] x, float[] y)
    {
        if (x.Length != y.Length || x.Length == 0) return -1;
        double dot = 0, x2 = 0, y2 = 0;
        for (int i = 0; i < x.Length; i++) { dot += (double)x[i] * y[i]; x2 += (double)x[i] * x[i]; y2 += (double)y[i] * y[i]; }
        return x2 == 0 || y2 == 0 ? -1 : dot / Math.Sqrt(x2 * y2);
    }

    public static double Lexical(string content, string[] queryTokens, string phrase)
    {
        var tokens = Tokenize(content);
        if (tokens.Length == 0 || queryTokens.Length == 0) return 0;
        var tf = tokens.GroupBy(t => t).ToDictionary(g => g.Key, g => g.Count());
        int hit = 0;
        double result = 0;
        foreach (var token in queryTokens)
            if (tf.TryGetValue(token, out var frequency)) { hit++; result += (frequency * 2.2) / (frequency + 1.2) / (1 + tokens.Length / 3000.0); }
        if (queryTokens.Length >= 4 && hit < 2) return 0;
        if (phrase.Length >= 8 && Normalize(content).Contains(phrase, StringComparison.Ordinal)) result += 5;
        return result;
    }

    public static string[] Tokenize(string s) => Regex.Matches(Normalize(s), @"[a-z0-9]+")
        .Select(m => m.Value).Where(v => v.Length >= 2).ToArray();
    private static string Normalize(string text)
    {
        var decomposed = text.ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var output = new StringBuilder();
        foreach (char c in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark) output.Append(c);
        return output.ToString().Normalize(NormalizationForm.FormC);
    }
    private sealed record Candidate(RagChunk Chunk, double Lexical);
}
