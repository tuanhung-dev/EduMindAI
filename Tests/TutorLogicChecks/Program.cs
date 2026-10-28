using EduMind.Api.Services;

int passed = 0;
void Check(string title, bool condition)
{
    if (!condition) throw new Exception($"[FAIL] {title}");
    Console.WriteLine($"[PASS] {title}");
    passed++;
}

Check("Follow-up 'nó' được nhận diện", TutorConversationLogic.IsFollowUp("Cho ví dụ về nó"));
Check("Follow-up 'giải thích thêm' được nhận diện", TutorConversationLogic.IsFollowUp("Giải thích thêm"));
Check("Câu mới không bị coi là câu nối", !TutorConversationLogic.IsFollowUp("Hãy định nghĩa học sâu và mạng nơ-ron"));
Check("Câu hỏi mới không lẫn chủ đề cũ",
    TutorConversationLogic.BuildRetrievalQuery("Định nghĩa học sâu", new[] { "Điện trở là gì?" }) == "Định nghĩa học sâu");
Check("Câu nối có chủ đề gần nhất",
    TutorConversationLogic.BuildRetrievalQuery("Cho ví dụ về nó", new[] { "Học sâu là gì?" })
        .Contains("Học sâu là gì?"));
Check("Không có lịch sử thì không tự bịa ngữ cảnh",
    TutorConversationLogic.BuildRetrievalQuery("Giải thích thêm", Array.Empty<string>()) == "Giải thích thêm");
Check("Chủ đề được giữ qua ba lượt hỏi liên tiếp",
    TutorConversationLogic.BuildRetrievalQuery("Tại sao?", new[] { "Học sâu là gì?", "Cho ví dụ về nó" })
        .Contains("Học sâu là gì?"));
Check("Nguồn PDF đúng được giữ lại",
    TutorConversationLogic.RemoveUnsupportedCitations("Tài liệu [Trang 3]", new[] { 3, 4 }, false) == "Tài liệu [Trang 3]");
Check("Nguồn PDF không có bị thay bằng nhãn chưa xác minh",
    TutorConversationLogic.RemoveUnsupportedCitations("Xem [Trang 999]", new[] { 3, 4 }, false)
        == "Xem [nguồn chưa xác minh]");
Check("Không dùng nhãn Phần với PDF",
    TutorConversationLogic.RemoveUnsupportedCitations("Xem [Phần 3]", new[] { 3 }, false)
        == "Xem [nguồn chưa xác minh]");
Check("Word giữ nguồn Phần và loại Trang",
    TutorConversationLogic.RemoveUnsupportedCitations("[Phần 2]; [Trang 2]", new[] { 2 }, true)
        == "[Phần 2]; [nguồn chưa xác minh]");
Check("Nguồn rỗng không thể được hợp thức hóa",
    TutorConversationLogic.RemoveUnsupportedCitations("[Trang 1]", Array.Empty<int>(), false)
        == "[nguồn chưa xác minh]");

Console.WriteLine($"ĐẠT {passed} kiểm thử logic thuần. Vẫn phải kiểm tra API, MySQL và Ollama thực tế.");
