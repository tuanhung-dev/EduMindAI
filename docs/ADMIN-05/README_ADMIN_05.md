# EduMindAI · ADMIN-05: Quản lý đề thi và kết quả luyện thi

## Bản vá gồm gì?

**Backend mới:** `backend/EduMind.Api/Controllers/AdminExamsController.cs` — thêm các API quản trị, không cần migration hay sửa bảng MySQL.

**Frontend mới:** `frontend/src/pages/AdminExamsPage.tsx`, `frontend/src/pages/AdminExamsPage.css`, `frontend/src/services/adminExamsService.ts`.

**Frontend đã sửa:** `frontend/src/App.tsx`, `frontend/src/layouts/AppLayout.tsx` để đăng ký route `/app/admin/exams` và thêm menu Admin.

**Kiểm thử:** `scripts/kiem-tra-admin05.ps1`.

## Phạm vi chức năng thật

- Thống kê toàn hệ thống: tổng đề, tổng lượt làm, bài đã nộp/chưa nộp, điểm trung bình, bài dưới 50%, đề chỉ có nguồn một phần.
- Biểu đồ lượt nộp bài 7 ngày UTC.
- Danh sách tất cả đề: phân trang thật ở Backend (15/trang), tìm tên đề, tài liệu, email người tạo, lọc độ khó và ID tài liệu.
- Danh sách toàn bộ lượt làm: phân trang thật, lọc bài đã nộp/chưa nộp, tìm tên đề/email người làm và lọc theo ID đề.
- Xem câu hỏi đề thi, **không trả đáp án chuẩn** của đề chưa nộp.
- Xem điểm, bài làm đã nộp, lựa chọn/đáp án/giải thích/trang nguồn. Bài chưa nộp **không tiết lộ đáp án**.
- Xuất CSV các bản ghi **ở trang đang hiển thị** (không nói là xuất toàn cơ sở dữ liệu). Có bảo vệ CSV formula injection.
- Xóa đề chỉ khi **chưa có lượt làm**, xác nhận nhập `XOA <id>`; khi đã có lượt làm API trả 409 để bảo toàn lịch sử.
- Loading / error / empty state / responsive; yêu cầu quyền Admin tại Backend `[Authorize(Roles = "Admin")]`.

### Các API mới (cùng namespace)

`GET /api/admin/exams/overview`

`GET /api/admin/exams/quizzes?search=&difficulty=&documentId=&page=1&pageSize=15`

`GET /api/admin/exams/quizzes/{id}`

`GET /api/admin/exams/attempts?search=&state=submitted|open&quizId=&page=1&pageSize=15`

`GET /api/admin/exams/attempts/{id}`

`DELETE /api/admin/exams/quizzes/{id}` — chỉ khi chưa có lượt làm.

Tất cả đều yêu cầu Bearer token của Admin. Không có endpoint sửa điểm, chỉnh đáp án chuẩn, xóa lịch sử hay khôi phục đề đã xóa.

## Cài đặt trên Windows PowerShell

1. Sao lưu **ít nhất** hai file đã có: `frontend/src/App.tsx` và `frontend/src/layouts/AppLayout.tsx` (bản ZIP sẽ ghi đè chúng).
2. Giải nén ZIP thẳng vào `C:\Projects\EduMindAI` với `-Force` hoặc copy từng file ở đúng đường dẫn.
3. Backend:

```powershell
cd C:\Projects\EduMindAI\backend\EduMind.Api
dotnet restore
dotnet build
dotnet run --no-launch-profile --urls "http://localhost:5080"
```

4. Mở PowerShell khác và chạy Frontend:

```powershell
cd C:\Projects\EduMindAI\frontend
npm ci
npm run build
npm run lint
npm run dev
```

5. Đăng nhập tài khoản có role `Admin`, truy cập `/app/admin/exams`.

**Quan trọng:** Vì bước này có API mới, chỉ giải nén frontend mà không cập nhật và khởi động lại backend sẽ gặp lỗi HTTP 404.

## Checklist nghiệm thu 10 mục

- [ ] **05.1** Backend `dotnet build` thành công; endpoint `/api/admin/exams/overview` tồn tại.
- [ ] **05.2** Học viên không gọi được API Admin (403) và không mở được route Admin.
- [ ] **05.3** Admin gọi API thật trả 200 và số đề/lượt nộp đúng dữ liệu MySQL.
- [ ] **05.4** Danh sách đề tìm kiếm, lọc độ khó, phân trang đúng ở máy chủ.
- [ ] **05.5** Xem chi tiết đề không làm lộ `correctOption` / `explanation`.
- [ ] **05.6** Danh sách lượt làm lọc trạng thái, tìm email, ID đề, phân trang đúng.
- [ ] **05.7** Lượt chưa nộp không trả đáp án; lượt đã nộp hiển thị điểm và lời giải đúng response.
- [ ] **05.8** Xóa đề chưa có lượt làm sau khi nhập xác nhận; đề đã có lượt làm bị từ chối HTTP 409.
- [ ] **05.9** Xuất CSV trang hiện tại an toàn, không tự nhận là xuất toàn dữ liệu.
- [ ] **05.10** Build/lint Frontend thành công, responsive, loading/error/empty state không lỗi.

Bộ kiểm tra không tự xóa đề và không tự làm bài. Để chạy build và smoke test:

```powershell
cd C:\Projects\EduMindAI
powershell -ExecutionPolicy Bypass -File .\scripts\kiem-tra-admin05.ps1
```

Biến `EDUMIND_ADMIN_TEST_TOKEN` có thể cung cấp token Admin **chỉ trong phiên PowerShell** để kiểm tra các GET API có xác thực. Script không in token, không ghi token vào file, không kiểm tra DELETE.

## Kết quả kiểm tra khi tạo bản vá

- Đã kiểm tra TypeScript của bộ frontend tích hợp.
- ESLint trên các file mới/sửa: đạt.
- Đã kiểm tra cú pháp CSS và cấu trúc ZIP.
- **Chưa chạy được `dotnet build` trên môi trường tạo file vì không có .NET SDK.** Vì vậy phải chạy `dotnet build` trên máy Windows của bạn.
- Production Vite build cần chạy trên máy Windows có node_modules phù hợp; môi trường tạo file dùng node_modules Windows nên không chạy được Rolldown Linux.
- Chưa kết nối được MySQL hay tài khoản Admin thực tế của bạn để nghiệm thu API với dữ liệu thật.

## Cảnh báo trước khi áp dụng

Bản vá dựa trên cấu trúc nguồn ADMIN-04 được dùng để phát triển trước đó. Nếu bạn đã chỉnh `App.tsx` hoặc `AppLayout.tsx` sau bước ADMIN-04, hãy đối chiếu `.diff` và chỉ chép route/import/menu để không mất các sửa đổi mới.
