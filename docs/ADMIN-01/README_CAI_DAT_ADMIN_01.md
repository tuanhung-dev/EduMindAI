# EduMindAI · BƯỚC ADMIN 01 — Tổng quan quản trị

## Phạm vi
Chỉ cập nhật **frontend**:
- `frontend/src/pages/AdminDashboardPage.tsx` (thay file cũ)
- `frontend/src/pages/AdminDashboardPage.css` (file mới)

**Không sửa Backend, AuthContext, routes, AppLayout, trang quản trị người dùng/môn học.**

## Có gì mới?
1. Banner Admin đồng bộ với Trang chủ/Môn học/Kho tài liệu (xanh đậm, trắng).
2. 8 KPI từ API thật `/api/admin/dashboard`, không dùng số liệu giả.
3. Biểu đồ số lượt nộp bài 7 ngày + bảng dữ liệu chi tiết.
4. Cảnh báo tài khoản khóa và tài liệu chưa có chủ sở hữu (chỉ đọc).
5. Liên kết quản lý Người dùng và Môn học dùng các route hiện có.
6. Danh mục các phân hệ quản trị **chưa có API** được ghi rõ là kế hoạch, không đặt nút thao tác giả.
7. Loading, lỗi API, nút thử lại, responsive và hỗ trợ bàn phím.

## Cài trên Windows
Tải `EduMindAI_ADMIN_01_Dashboard.zip` vào Downloads, rồi chạy PowerShell:

```powershell
cd C:\Projects\EduMindAI
Copy-Item .\frontend\src\pages\AdminDashboardPage.tsx .\frontend\src\pages\AdminDashboardPage.tsx.bak -Force
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\EduMindAI_ADMIN_01_Dashboard.zip" -DestinationPath "C:\Projects\EduMindAI" -Force
cd C:\Projects\EduMindAI\frontend
npm run build
npm run lint
npm run dev
```

Truy cập URL frontend Vite, đăng nhập **bằng tài khoản có role Admin**, mở `http://localhost:5173/app/admin` (thay cổng 5173 nếu Vite báo cổng khác).

## Nghiệm thu bước ADMIN 01
- [ ] Có menu Dashboard Admin khi đăng nhập Admin.
- [ ] Không phải Admin bị chặn ở `/app/admin` (router `AdminOnly` hiện có).
- [ ] Banner và 8 KPI hiển thị, số liệu khớp với API `/api/admin/dashboard`.
- [ ] Click Làm mới cập nhật lại dữ liệu.
- [ ] Biểu đồ 7 ngày và bảng dữ liệu hiển thị đúng, gồm trường hợp không có lượt nộp bài.
- [ ] 2 thẻ Quản lý người dùng / Quản lý môn học điều hướng đúng.
- [ ] Nếu API trả lỗi, có thông báo và nút Thử lại.
- [ ] Giao diện không tràn ngang laptop 1366×768 và điện thoại 390×844.
- [ ] `npm run build` và `npm run lint` chạy đạt trên máy Windows.

## Kiểm thử thực hiện trong môi trường tạo bản vá
- TypeScript `tsc -b`: **đạt**.
- ESLint đối với `AdminDashboardPage.tsx`: **đạt**.
- CSS qua parser PostCSS: **đạt**.
- Vite production build ở đây **chưa chạy được** do thiếu Rolldown native binding Linux trong node_modules có sẵn; cần nghiệm thu trên Windows.
- **Chưa gọi API backend trên máy của bạn**. Không khẳng định số liệu server đã được kiểm tra thực tế.

## Lộ trình từng bước tiếp theo
- **ADMIN 02:** Rà soát quản lý người dùng (tìm kiếm, phân trang, xác nhận thay đổi quyền, tự bảo vệ tài khoản Admin).
- **ADMIN 03:** Quản trị môn học (tạo, sửa thông tin, ẩn/hiện, kiểm tra ràng buộc).
- **ADMIN 04:** Quản lý học liệu toàn hệ thống — cần xác minh/bổ sung API Admin riêng trước khi hiện các nút thao tác.
- **ADMIN 05:** Quản lý đề thi, thống kê chi tiết và giám sát AI — các phần thiếu API sẽ đánh dấu yêu cầu backend cho giai đoạn sau, chưa tự chỉnh backend.

**Nguyên tắc:** Chỉ chuyển bước mới sau khi bước hiện tại build và nghiệm thu được ở frontend của bạn.
