# ADMIN-06 — Giám sát AI và hoạt động hệ thống (EduMindAI)

## Mục tiêu và nguyên tắc

- Backend `GET /api/admin/monitoring/overview?days=7|30`: thống kê toàn hệ thống dựa trên các bảng MySQL hiện có; không trả nội dung học tập/câu hỏi của người dùng.
- Backend `GET /api/admin/monitoring/ai-status`: kiểm tra Ollama **chỉ bằng GET /api/tags trên HTTP loopback**; không sinh token. Nếu AI Provider là OpenAI, không phát sinh bất kỳ request OpenAI nào và trạng thái là `not_checked`.
- Bộ đếm request AI ở mức HTTP, in-memory, chỉ đếm POST `/api/ai/ask`, `/api/ai/ask/stream`, `/api/quizzes/generate`, `/api/documents/{id}/summarize`.
- Frontend trang `/app/admin/monitoring`: tabs Tổng quan, Dịch vụ AI, Cảnh báo tài liệu; biểu đồ 7/30 ngày, thống kê trạng thái, làm mới, biểu đồ/CSV không bắt buộc.
- Tất cả API mới **chỉ đọc**, `[Authorize(Roles = "Admin")]`; không xóa, lập chỉ mục, thay đổi dữ liệu, hiển thị API keys, token, prompt, nội dung chat, hoặc chủ tài liệu.

## Các file trong ZIP

```
backend/EduMind.Api/Program.cs                       [ghi đè; thêm DI/middleware]
backend/EduMind.Api/Controllers/AdminMonitoringController.cs  [mới]
backend/EduMind.Api/Services/AdminAiRequestMetrics.cs         [mới]
frontend/src/App.tsx                                 [ghi đè; thêm route]
frontend/src/layouts/AppLayout.tsx                   [ghi đè; thêm menu]
frontend/src/pages/AdminMonitoringPage.tsx           [mới]
frontend/src/pages/AdminMonitoringPage.css           [mới]
frontend/src/services/adminMonitoringService.ts      [mới]
scripts/kiem-tra-admin06.ps1                         [mới]
```

**Lưu ý**: `App.tsx` và `AppLayout.tsx` được tạo dựa trên bản ADMIN-05 mới nhất trong cuộc trò chuyện. Nếu đã tự sửa thêm hai file đó, hãy áp dụng riêng các dòng mới từ `ADMIN06_DoiChieu.diff` để không mất chỉnh sửa của bạn. `Program.cs` dựa trên mã Backend gốc bạn gửi; cũng nên đối chiếu trước khi ghi đè nếu đã có thay đổi cục bộ. Không có migration MySQL.

## Cài đặt Windows

```powershell
cd C:\Projects\EduMindAI
Copy-Item .\frontend\src .\backup_src_before_admin06 -Recurse -Force
Copy-Item .\backend\EduMind.Api\Program.cs .\backend\EduMind.Api\Program.cs.bak -Force
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\EduMindAI_ADMIN_06_GiamSat_AI_HeThong.zip" -DestinationPath "C:\Projects\EduMindAI" -Force
```

**Chạy Backend** trong PowerShell cửa sổ 1:

```powershell
cd C:\Projects\EduMindAI\backend\EduMind.Api
dotnet build
dotnet run --no-launch-profile --urls "http://localhost:5080"
```

**Chạy Frontend** trong cửa sổ 2:

```powershell
cd C:\Projects\EduMindAI\frontend
npm run build
npm run lint
npm run dev
```

Đăng nhập Admin và mở `http://localhost:5173/app/admin/monitoring` (thay cổng nếu Vite cung cấp cổng khác).

**Kiểm tra tự động** từ thư mục gốc (Backend cần chạy ở PowerShell khác):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\kiem-tra-admin06.ps1
```

Script hỏi token Admin dưới dạng nhập kín **tùy chọn**, không ghi token vào báo cáo. Không gửi token, mật khẩu hay API key cho người khác. Có thể chạy `-SkipBuild`, `-SkipApi` để chỉ kiểm tra một phần.

## Checklist nghiệm thu

| ID | Thao tác | Kỳ vọng |
|---|---|---|
| 06.1 | `dotnet build` | PASS; API chạy được; chưa có MySQL migration |
| 06.2 | `npm run build`, `npm run lint` | PASS |
| 06.3 | Gọi `/api/admin/monitoring/overview` không có token | HTTP 401/403 |
| 06.4 | Đăng nhập Student và gọi 2 endpoint | HTTP 403 |
| 06.5 | Đăng nhập Admin và mở route `/app/admin/monitoring` | Giao diện hiển thị và lấy dữ liệu từ API |
| 06.6 | Xem tổng số/Ready/Queued/Processing/Failed | Khớp bản ghi MySQL thực tế |
| 06.7 | Chuyển 7/30 ngày | Biểu đồ hoạt động tương ứng kỳ chọn |
| 06.8 | Cấu hình Ollama local + bấm Kiểm tra AI | Trả `online` nếu dịch vụ chạy và model cấu hình có trong danh sách |
| 06.9 | Dừng Ollama + kiểm tra lại | Trả `offline` (không làm giao diện sập) |
| 06.10 | Chọn AI:Provider=OpenAI + kiểm tra | `not_checked` và không gửi request AI tính phí |
| 06.11 | Xem các tài liệu Failed/chờ lâu | Chỉ trả metadata, không trả PDF hoặc prompt của học viên |
| 06.12 | Gọi AI hợp lệ, refresh trang | Bộ đếm request HTTP tăng, không xuất hiện câu hỏi hay dữ liệu bí mật |
| 06.13 | Khởi động lại Backend | Bộ đếm RAM reset; thống kê MySQL vẫn giữ nguyên |
| 06.14 | Kiểm tra responsive | Desktop 1366x768 và mobile 390x844 không tràn ngang |

## Giới hạn kỹ thuật (cần trung thực khi nghiệm thu)

1. Bộ đếm HTTP AI **reset khi Backend restart**, không ghi số lượng token hay chi phí sử dụng và không thể coi là hóa đơn OpenAI.
2. Request streaming có thể trả HTTP 200 dù stream sau đó gián đoạn; mã HTTP là kết quả giao thức HTTP, không bảo đảm nội dung AI hoàn chỉnh.
3. Thống kê chat từ các tin nhắn `assistant` **đã lưu** trong MySQL, không phải tổng request hay số lượt AI tiêu thụ token.
4. Thời gian >1 giờ tính từ `Document.CreatedAtUtc`, không phải thời điểm bắt đầu chạy indexer. Đây là gợi ý kiểm tra chứ không phải xác nhận worker bị kẹt.
5. Kiểm tra Ollama chỉ xác minh API liệt kê model, không phải test suy luận thực tế; không thăm dò OpenAI để tránh phí token.
6. Chưa có bảng audit log tập trung, chỉ số GPU/CPU của Ollama, thời gian inference thực, chi phí/token, hay hệ thống cảnh báo realtime/email. Những tính năng này cần telemetry & backend riêng để tránh số liệu đoán.
7. App backend hiện có `DocumentIndexWorker` trong tiến trình đơn. Nếu chạy nhiều backend replicas, cần bổ sung cơ chế khóa job phân tán trước khi triển khai.

## Kiểm tra đã thực hiện trong môi trường chuẩn bị

- TypeScript (`tsc -b`): PASS trên frontend tích hợp ADMIN-05 + ADMIN-06.
- ESLint các file FE mới và hai file điều hướng sửa: PASS.
- CSS parser `tinycss2`: PASS.
- .NET `dotnet build`: **không chạy được trong môi trường chuẩn bị (không có .NET SDK)**, bắt buộc chạy trên Windows trước khi đánh dấu hoàn tất.
- API + MySQL + Ollama thật: **chưa nghiệm thu** trên máy bạn.
- Vite production build: **chưa xác nhận**, cần chạy `npm run build` trên Windows.
