using EduMind.Api.Services;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;

int tests = 0;
void Check(bool good, string name)
{
    if (!good) throw new Exception("[FAIL] " + name);
    Console.WriteLine("[PASS] " + name); tests++;
}

var config = new ConfigurationBuilder().AddInMemoryCollection(
    new Dictionary<string, string?> { ["Rag:Embeddings:Enabled"] = "false" }).Build();
using var http = new HttpClient();
using var cache = new MemoryCache(new MemoryCacheOptions());
var service = new DocumentRetrievalService(http, config, NullLogger<DocumentRetrievalService>.Instance, cache);
var docs = new RagChunk[] {
    new(1, 1, 0, "Mạng nơ-ron gồm các lớp đầu vào, ẩn và đầu ra. Gradient descent điều chỉnh trọng số.", 11, "network.pdf"),
    new(2, 2, 1, "Backpropagation tính đạo hàm, lan truyền lỗi để cập nhật trọng số mô hình.", 11, "network.pdf"),
    new(3, 1, 0, "Chu trình quang hợp ở thực vật hấp thụ ánh sáng và tạo glucose.", 12, "biology.docx"),
    new(4, 2, 1, "Lục lạp chứa diệp lục và tham gia quá trình quang hợp.", 12, "biology.docx"),
    new(5, 3, 2, "Quang hợp giải phóng oxy trong điều kiện chiếu sáng.", 12, "biology.docx")
};
var result = await service.SearchAcrossAsync("quang hợp thực vật glucose", docs, CancellationToken.None);
Check(result.Sources.Count > 0, "Has retrieved evidence");
Check(result.Sources[0].DocumentId == 12, "Ranks relevant document first");
Check(result.Sources.All(x => docs.Any(y => y.Id == x.Id)), "Never invents source chunks");
Check(result.TotalChunks == docs.Length, "Counts complete searchable corpus");
Check(result.Method == "keyword", "Offline keyword mode available");
var noMatch = await service.SearchAcrossAsync("vũ trụ sao hỏa quỹ đạo", docs, CancellationToken.None);
Check(noMatch.Sources.Count == 0, "Abstains when no lexical evidence exists");
Check(RagCitationValidator.StripUnknown("Thấy ở [Trang 1], sai [Trang 99].", ["[Trang 1]"])
    .Contains("[nguồn chưa xác minh]"), "Blocks fabricated citation numbers");
Check(RagCitationValidator.StripUnknown("[T1 Trang 2] và [T2 Phần 1]", ["[T2 Phần 1]"])
    == "[nguồn chưa xác minh] và [T2 Phần 1]", "Checks multi-document labels separately");
Check(DocumentContentReader.IsWord("note.docx") && !DocumentContentReader.IsWord("note.pdf"), "Word and PDF detected correctly");
Check(DocumentRetrievalService.Tokenize("Học sâu và nơ-ron").Contains("ron"), "Vietnamese tokenizer handles accent normalization");
Console.WriteLine($"RAG STATIC/UNIT CHECKS PASSED: {tests} tests. Requires integration evaluation on your real files.");
