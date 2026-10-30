using EduMind.Api.Services;

int checks = 0;
void Check(bool valid, string name)
{
    if (!valid) throw new Exception("FAIL: " + name);
    Console.WriteLine("[PASS] " + name);
    checks++;
}
var now = new DateTime(2026, 10, 28, 8, 0, 0, DateTimeKind.Utc);
var failure = FlashcardReviewRules.Next(false, 7, 19, now);
Check(failure.Streak == 0 && failure.NextUtc == now.AddMinutes(10), "Sai: reset streak và ôn lại 10 phút");
var one = FlashcardReviewRules.Next(true, 0, 0, now);
Check(one.Streak == 1 && one.NextUtc == now.AddDays(1), "Nhớ lần 1: 1 ngày");
var two = FlashcardReviewRules.Next(true, 1, 1, now);
Check(two.Streak == 2 && two.NextUtc == now.AddDays(3), "Nhớ lần 2: 3 ngày");
var three = FlashcardReviewRules.Next(true, 2, 3, now);
Check(three.Streak == 3 && three.NextUtc == now.AddDays(7), "Nhớ lần 3: 7 ngày");
var four = FlashcardReviewRules.Next(true, 3, 4, now);
Check(four.Streak == 4 && four.NextUtc == now.AddDays(14), "Nhớ lần 4: 14 ngày");
var five = FlashcardReviewRules.Next(true, 4, 5, now);
Check(five.Streak == 5 && five.NextUtc == now.AddDays(30), "Nhớ lần 5: 30 ngày");
var six = FlashcardReviewRules.Next(true, 5, 6, now);
Check(six.Streak == 6 && six.NextUtc == now.AddDays(60), "Nhớ nhiều lần: tối đa 60 ngày");
var max = FlashcardReviewRules.Next(true, 30, 100, now);
Check(max.Streak == 30 && max.NextUtc == now.AddDays(60), "Giới hạn streak và lịch");
Check(QuizLearningRules.Normalize("Mạng HỌC SÂU") == "mang hoc sau", "Chuẩn hóa tiếng Việt");
Check(QuizLearningRules.HasDuplicatedOptions(new[] {"Mạng máy tính", "mang may tinh", "Học máy", "Học sâu"}), "Phát hiện 2 phương án trùng sau chuẩn hóa");
Check(!QuizLearningRules.HasDuplicatedOptions(new[] {"CPU", "RAM", "GPU", "SSD"}), "Chấp nhận 4 phương án khác nhau");
Check(!QuizLearningRules.HasDocumentEvidence("Thuật toán nào được sử dụng?", "Giải thích không rõ từ nguồn.", "ngắn"), "Từ chối nguồn quá ngắn");
Check(QuizLearningRules.HasDocumentEvidence("Mạng nơ-ron là gì?", "Mạng nơ-ron là một mạng có nhiều lớp liên kết nhân tạo.", "Mạng nơ ron nhân tạo có các lớp liên kết và các trọng số để học dữ liệu đầu vào."), "Nguồn có từ khóa liên quan");
Check(!QuizLearningRules.HasDocumentEvidence("Thuật toán lượng tử?", "Một nội dung hoàn toàn lạc đề về máy bay và sông núi.", "Mạng máy tính sử dụng các giao thức truyền tin để trao đổi dữ liệu giữa thiết bị."), "Phát hiện thiếu neo từ vựng");
Console.WriteLine($"GROUP B LOGIC CHECKS PASSED ({checks}/{checks}). Requires integration/ownership/UI tests.");
