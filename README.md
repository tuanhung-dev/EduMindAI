# EduMind AI — Nền tảng học tập thông minh từ tài liệu PDF

> **Trạng thái: bản Development / đồ án đang phát triển.** README này được cập nhật theo mã nguồn trong `Projects (2).zip` ngày 26/10/2026. Các mục **Đã có mã nguồn** không đồng nghĩa đã được xác nhận chạy thành công trên máy thật.

## 1. Giới thiệu

EduMind AI là ứng dụng web phục vụ học tập từ tài liệu PDF: lưu tài liệu theo môn học, trích xuất văn bản, đặt câu hỏi với AI, tạo đề trắc nghiệm, chấm điểm và xem tiến độ. Hệ thống có trang học viên và trang quản trị.

**Công nghệ thực tế trong repository này (không phải bản Java thử nghiệm):**

| Thành phần | Công nghệ |
|---|---|
| Frontend | React, TypeScript, Vite, React Router |
| Backend | ASP.NET Core Web API / .NET 10 |
| Database | MySQL 8.4, Entity Framework Core |
| Xác thực | ASP.NET Core Identity, Bearer Token, vai trò `Student` / `Admin` |
| Xử lý PDF | PdfPig |
| AI | OpenAI Responses API, cấu hình và API key chỉ nằm ở Backend |

## 2. Các phần đã được xây dựng trong mã nguồn

### Nền tảng và giao diện
- Cấu trúc `backend/EduMind.Api` và `frontend` riêng biệt, giao tiếp qua REST API.
- Dashboard học viên, Sidebar/Router, trang môn học, kho PDF, Gia sư AI, luyện thi, tiến độ và khu vực Admin.
- API kiểm tra sức khỏe `GET /api/health` và API kiểm tra cơ sở dữ liệu (xem `Controllers/DatabaseController.cs`).

### Tài khoản và phân quyền
- API đăng ký, đăng nhập, xem thông tin tài khoản; đăng ký xong **không bắt buộc xác minh email** trong bản demo.
- ASP.NET Core Identity quản lý mật khẩu, giới hạn thử đăng nhập, đổi/đặt lại mật khẩu và phân vai trò Student/Admin.
- Quyền sở hữu được kiểm tra tại Backend đối với tài liệu, đề thi, lượt làm bài và tiến độ; Admin có API quản trị.
- Giao diện Admin: thống kê, quản lý môn học, tài khoản, khóa/mở khóa và vai trò.

### Môn học và tài liệu PDF
- API danh sách/tạo/cập nhật môn học; danh sách môn học trên React.
- Upload PDF (giới hạn 10 MB), kiểm tra phần đầu `%PDF-`, lưu file bên phía Backend và metadata trong MySQL.
- Xem PDF với yêu cầu xác thực; trích xuất văn bản PdfPig; chia nội dung thành `document_chunks` theo trang, có đoạn chồng lấn.
- API lập chỉ mục `/api/documents/{id}/index`, xem chunks và trạng thái tài liệu.

### Chức năng học tập/AI
- **Gia sư AI:** API `POST /api/ai/ask`, tìm chunks bằng khớp từ khóa, gửi ngữ cảnh tới Responses API và trả về văn bản cùng trang tham khảo.
- **Tóm tắt PDF:** API `POST /api/documents/{id}/summarize`, chọn mẫu chunks và báo rõ nếu chỉ dùng một phần tài liệu.
- **Sinh đề:** API `POST /api/quizzes/generate`, yêu cầu JSON theo schema, kiểm tra số câu/đáp án/chunk nguồn rồi lưu đề và câu hỏi.
- **Làm bài:** Bắt đầu/nộp bài, chấm đúng sai bằng Backend dựa trên đáp án đã lưu, ngăn nộp trùng, xem giải thích và nguồn PDF.
- **Tiến độ:** API thống kê riêng theo học viên, biểu đồ điểm, lịch sử, trang PDF có câu sai để ôn tập.

### Cơ sở dữ liệu
Có Entity/DbContext và các migration cho `subjects`, `documents`, `document_chunks`, `quizzes`, `quiz_questions`, `quiz_attempts`, `quiz_answers` và các bảng ASP.NET Core Identity. **Phải kiểm tra và áp dụng migration trên database thật trước khi chạy API.**

## 3. Trạng thái kiểm tra và giới hạn hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Có mã nguồn Frontend / Backend nêu trên | Đã xác nhận bằng kiểm tra file |
| TypeScript (`tsc -b`) | **Đạt** trong môi trường kiểm tra từ file ZIP |
| ESLint | **Đạt** trong môi trường kiểm tra từ file ZIP |
| `dotnet build` trên bản ZIP mới nhất | **Chưa kiểm thử** (môi trường kiểm tra không có .NET SDK) |
| Kết nối MySQL và migration trên máy người dùng | **Chưa xác minh** |
| Upload/lập chỉ mục PDF, đăng nhập thực tế | Có code; **cần kiểm thử tích hợp** |
| Gọi OpenAI hỏi đáp / tóm tắt / sinh đề | Có code; **chưa xác nhận thành công**, trước đó từng gặp HTTP 400/502 |
| Sẵn sàng triển khai công khai | **Chưa** (các API nghiệp vụ còn giới hạn Development) |

> **Không nên ghi “AI đã hoàn thành/hoạt động ổn định”** cho đến khi thử thành công API thật với tài liệu thử, tài khoản thử và model hợp lệ.

## 4. Cách chạy trên Windows

### Yêu cầu
- .NET SDK 10, Node.js và npm, MySQL 8.x.
- Có database đang dùng (`edumind_ai`) và chuỗi kết nối từ User Secrets hoặc biến môi trường.

### Backend

```powershell
cd C:\Projects\EduMindAI\backend\EduMind.Api
$env:DOTNET_ENVIRONMENT = "Development"
$env:ASPNETCORE_ENVIRONMENT = "Development"
dotnet restore
dotnet build
dotnet run --no-launch-profile --urls "http://localhost:5080"
```

**Cấu hình bí mật:** không đưa password, key vào README, GitHub, React `.env` hay ảnh chụp màn hình. Tại thư mục Backend dùng `dotnet user-secrets set` (không đưa mật khẩu thật vào ví dụ công khai) để tạo các khóa sau:

- `ConnectionStrings:DefaultConnection` — chuỗi kết nối MySQL.
- `OpenAI:ApiKey` — API key riêng của Backend.
- `OpenAI:Model` — model có quyền sử dụng, mặc định code là `gpt-4.1-mini`.
- `BootstrapAdmin:Email`, `BootstrapAdmin:Password` — **chỉ cho khởi tạo Admin ở Development, không giữ lâu dài**.

Kiểm tra **có tồn tại khóa** bằng `dotnet user-secrets list` ngay tại máy; kết quả có thể chứa bí mật, **không đăng lên GitHub hoặc gửi công khai**. Trước khi dùng những API cần Identity, kiểm tra migration với `dotnet ef migrations list` rồi mới cân nhắc `dotnet ef database update` sau khi sao lưu database.

### Frontend

```powershell
cd C:\Projects\EduMindAI\frontend
npm ci
npm run build
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
```

Trong `frontend/.env.development` (file cá nhân, không commit):

```dotenv
VITE_API_BASE_URL=http://localhost:5080
```

Mở `http://127.0.0.1:5173`.

## 5. Các API quan trọng (yêu cầu đăng nhập trừ API công khai)

| Nhóm | Endpoint tham khảo |
|---|---|
| Tài khoản | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me` |
| Môn học | `GET /api/subjects` và các endpoint trong `SubjectsController` |
| PDF | `GET/POST /api/documents`, `GET /api/documents/{id}/file`, `POST /api/documents/{id}/index` |
| Gia sư AI | `POST /api/ai/ask` |
| Tóm tắt | `POST /api/documents/{id}/summarize` |
| Luyện thi | `GET /api/quizzes`, `POST /api/quizzes/generate`, các endpoint ở `QuizAttemptsController` |
| Tiến độ | `GET /api/learning/progress` |
| Admin | Các endpoint trong `AdminDashboardController` / `SubjectsController` |

## 6. Lỗi đã phát hiện / chưa giải quyết hết

1. **OpenAI HTTP 400/502:** cấu hình thật, quyền model, payload và mạng từ máy Backend **chưa được xác nhận**. API đã có xử lý lỗi nhưng chưa có log/response upstream đủ để kết luận một nguyên nhân duy nhất. Xem `BAO_CAO_KIEM_TRA.md` và script `Scripts/Test-OpenAI.ps1`.
2. **Git theo dõi dữ liệu không nên commit:** file PDF, email thử nghiệm và thư mục build đã từng được Git theo dõi. `.gitignore` mới chỉ ngăn file **mới**; cần xóa khỏi Git index và xử lý lịch sử Git nếu từng công khai dữ liệu nhạy cảm.
3. **Truy xuất chunks:** thuật toán khớp từ khóa chỉ phù hợp demo, chưa phải RAG embedding/vector search. Bản vá đã thêm lấy mẫu trải đều cho câu hỏi tổng quan, nhưng không bảo đảm bao phủ toàn bộ PDF.
4. **Bảo mật:** token ở `localStorage`, chưa có cookie HttpOnly/CSRF theo mô hình triển khai; API nghiệp vụ còn giới hạn môi trường `Development`.
5. **Dữ liệu trước Identity:** các PDF/đề thi cũ có `OwnerUserId` rỗng sẽ không hiển thị trong tài khoản mới cho đến khi gán đúng chủ sở hữu có xác minh.
6. **PDF scan:** chưa có OCR; giới hạn upload 10 MB, lập chỉ mục tối đa 50 trang trong bản demo.

## 7. Các bước cần nghiệm thu tiếp theo

1. Xác nhận `/api/health`, kết nối MySQL và trạng thái migration.
2. Đăng ký, đăng nhập không cần xác minh email, kiểm tra phân quyền Student/Admin.
3. Upload một PDF text-layer, lập chỉ mục, kiểm tra số chunks và trang.
4. Kiểm tra `OpenAI:ApiKey`, model và gọi thử Responses API riêng trên máy; **không tiết lộ key**. Sau đó kiểm thử lần lượt hỏi đáp, tóm tắt, sinh đề.
5. Tạo đề 5 câu, làm bài và nộp; kiểm tra điểm, giải thích, lịch sử và tiến độ đúng người dùng.
6. Dọn lịch sử Git/secret trước khi để repository Public và bổ sung automated tests cho Backend.

## 8. Lưu ý về GitHub

File `.gitignore` ở thư mục gốc cần được đặt tại `C:\Projects\EduMindAI\.gitignore`. Trong bản ZIP đã có Git theo dõi `backend/EduMind.Api/Storage/DevMail`, `backend/EduMind.Api/Storage/Documents`, `backend/EduMind.Api/bin` và tài liệu PDF mẫu; không đẩy thêm dữ liệu cá nhân. Chỉ khi đã **sao lưu**, kiểm tra và muốn gỡ chúng khỏi phiên bản tiếp theo trên GitHub mới chạy:

```powershell
cd C:\Projects\EduMindAI
git rm -r --cached --ignore-unmatch backend/EduMind.Api/bin backend/EduMind.Api/obj backend/EduMind.Api/Storage frontend/node_modules dethi.pdf
git add .gitignore README.md BAO_CAO_KIEM_TRA.md
git status
git commit -m "docs: document implemented features and ignore generated files"
git push
```

`git rm --cached` không xóa file vật lý trên máy nhưng sẽ loại file khỏi commit kế tiếp. **Không loại bỏ dữ liệu khỏi các commit lịch sử**; dữ liệu/đường dẫn nhạy cảm từng bị công khai cần xử lý lịch sử và thay/thu hồi mã bí mật riêng.

---

Báo cáo rà soát chi tiết: [`BAO_CAO_KIEM_TRA.md`](./BAO_CAO_KIEM_TRA.md). Thư mục `frontend/README.md` trước đây là README mặc định của Vite; **README gốc này** là tài liệu chính thức mô tả đề tài và tiến độ của phiên bản .NET.
