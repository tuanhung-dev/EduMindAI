# Báo cáo rà soát mã nguồn EduMind AI (.NET)

**Nguồn:** `Projects (2).zip` (26/10/2026). Chỉ kiểm tra thư mục `Projects/EduMindAI`; không dùng bản sao lưu hoặc bản Java. **Không kết nối tới MySQL, không gọi OpenAI thật và không chạy .NET Backend trong môi trường này.**

## Lỗi/vấn đề xác nhận trực tiếp

| Ưu tiên | File/vị trí | Quan sát | Hướng xử lý |
|---|---|---|---|
| P0 | Git index trong ZIP; `backend/EduMind.Api/Storage/DevMail`, `Storage/Documents`, `bin`, `dethi.pdf` | Những đường dẫn này **đã được Git theo dõi**; `.gitignore` duy nhất nằm trong `frontend` nên chưa bảo vệ gốc | Bổ sung root `.gitignore`; kiểm tra riêng tư, `git rm --cached` và cân nhắc xử lý lịch sử/thu hồi token nếu từng lộ |
| P1 | `Controllers/AiTutorController.cs` | Dùng khớp từ khóa, không có embedding; nhiều câu hỏi tổng quan không tìm được đoạn phù hợp => trả lời mẫu mà không gọi AI | Đã bổ sung cơ chế lấy mẫu trải đều cho câu hỏi tổng quan trong bản vá; vẫn cần RAG thực sự về sau |
| P1 | `Controllers/AiTutorController.cs`, `DocumentSummariesController.cs`, `QuizzesController.cs` | Ba chức năng đều dùng `OpenAI:ApiKey` và model từ config Backend; nếu thiếu key sẽ 503, lỗi OpenAI upstream được trả về dưới HTTP 502 | Kiểm tra key/model/quyền truy cập và lỗi gốc bằng script riêng; không đoán rằng API 400 do mã nguồn nếu chưa có phản hồi chi tiết |
| P2 | `frontend/src/pages/LearningProgressPage.tsx` | Thông báo giao diện ghi “tổng hợp chung trên máy”, sai với API hiện lọc theo `OwnerUserId` | Đã sửa thông báo trong bản vá |
| P1 | `frontend/src/services/authService.ts` | Access token lưu `localStorage` | Bản demo local chấp nhận có điều kiện; cần thay bằng giải pháp phiên an toàn trước khi triển khai công khai |
| P1 | `Program.cs` và các API | Phần lớn API Documents/AI/Quizzes/Learning đang trả 403 ngoài môi trường Development | Giữ để tránh lộ API demo; cần thiết kế phân quyền/kiểm thử trước khi phát hành, không đơn giản bỏ điều kiện |
| P2 | `DocumentsController.cs` | Chỉ PDF có text layer; không OCR, tối đa 10 MB, 50 trang lập chỉ mục | Ghi rõ phạm vi MVP trong README |
| P2 | `DocumentSummariesController.cs` | Lấy mẫu tối đa 16 chunks, tóm tắt có thể chỉ bao phủ một phần nội dung | UI và API đã thông báo `isPartial`; cần thuật toán map-reduce nếu muốn toàn văn |
| P2 | Bảng documents, quizzes, quiz_attempts / migration Identity | Bản ghi cũ có OwnerUserId null; API lọc theo chủ sở hữu nên bị ẩn | Chỉ gán chủ sở hữu sau khi xác minh; không tự động cập nhật toàn bộ |

## Xác thực mã nguồn đã thực hiện

- Đọc source Backend controllers, model, DbContext và migration.
- Frontend: `node node_modules/typescript/bin/tsc -b` => **đạt (exit 0)**.
- Frontend: `node node_modules/eslint/bin/eslint.js .` => **đạt (exit 0)**.
- Không thể kiểm tra `dotnet build`, môi trường không có .NET SDK.
- Không có thông tin mật khẩu/API Key máy người dùng trong ZIP để xác nhận kết nối thực tế.

## Hướng chẩn đoán lỗi AI HTTP 400 trước đây

1. Xác nhận **Backend** chạy và có `OpenAI:ApiKey`, `OpenAI:Model` trong User Secrets (không chia sẻ giá trị bí mật).
2. Có thể chạy `Scripts/Test-OpenAI.ps1` trên PowerShell để gửi một yêu cầu văn bản ngắn trực tiếp tới Responses API; chỉ thực hiện khi chấp nhận một yêu cầu có thể phát sinh phí. Script hỏi key tại máy, không in key.
3. Nếu yêu cầu trực tiếp cũng thất bại, tập trung kiểm tra quyền model, cấu hình API, mạng, proxy, tài khoản thanh toán. **Ghi lại HTTP status, errorCode/errorParam, request ID nhưng không ghi key**.
4. Nếu gọi trực tiếp thành công mà `/api/ai/ask` lỗi, đối chiếu payload trong `AiTutorController.cs`, `OpenAiResponseInspector.cs`, thử câu hỏi đơn giản và dữ liệu chunks. Kiểm tra `Model` và `max_output_tokens` được API chấp nhận.
5. Nếu chỉ sinh đề thất bại, đọc lỗi upstream qua `QuizzesController.cs`; schema JSON và giới hạn output có thể tạo lỗi khác với hỏi đáp.

**Chưa đủ căn cứ để tuyên bố “đã sửa dứt điểm HTTP 400”**. Không tự thay API key hoặc model để đoán lỗi.

## Nội dung gói cập nhật

- `README.md`: mô tả dự án và các chức năng thực sự có code, phân biệt rõ đã triển khai với đã chạy thành công.
- `.gitignore`: chặn build, log, PDFs, thử nghiệm và bí mật cho toàn repository.
- `frontend/src/pages/LearningProgressPage.tsx`: sửa ghi chú sai về dữ liệu người dùng.
- `backend/EduMind.Api/Controllers/AiTutorController.cs`: hỗ trợ câu hỏi tổng quan bằng cách lấy mẫu các chunks trải đều thay vì trả ngay “không tìm thấy”; đây KHÔNG phải bản sửa chắc chắn cho HTTP 400.
- `Scripts/Test-OpenAI.ps1`: lệnh kiểm tra Responses API tối giản, tách biệt với upload và MySQL; yêu cầu người dùng nhập key tại máy.

**Không chỉnh sửa database/migration/API key và không đổi logic xác thực.** Có sửa một nhánh xử lý tìm chunks trong controller Gia sư AI; chưa thể biên dịch C# tại đây do thiếu .NET SDK, nên hãy chạy `dotnet build` trước khi áp dụng. **Không tuyên bố HTTP 400 đã được sửa dứt điểm.**
