# EduMindAI — ADMIN-04: Quản lý tài liệu toàn hệ thống (chỉ Frontend)

## Phạm vi phiên bản

Bản này bổ sung **giao diện giám sát tài liệu** cho tài khoản Admin. Dựa trên API của backend trong `Projects(2).zip`:

- `GET /api/documents`: Admin thấy các tài liệu có `OwnerUserId != null`; **không có** cột chủ sở hữu trong phản hồi.
- `GET /api/documents/{id}/file`: Admin có thể mở file từ danh sách được phép.
- `GET /api/documents/{id}/text`: Admin có thể xem trước văn bản tối đa 5 phần, mỗi phần tối đa 5000 ký tự.
- `GET /api/admin/dashboard`: tổng số tài liệu trong DB và số tài liệu chưa gắn chủ sở hữu.
- `GET /api/subjects`: lấy tên và mã môn.

**Chưa có API admin:** xóa/sửa/chuyển quyền sở hữu file, tìm chủ sở hữu, lập chỉ mục tài liệu của học viên. Không xây nút giả cho những thao tác này. `POST /api/documents/{id}/index/background` yêu cầu chính chủ tài liệu, vì vậy **không gọi từ ADMIN-04**.

## File cần chép

| Đường dẫn tương đối thư mục dự án | Ý nghĩa |
|---|---|
| frontend/src/pages/AdminDocumentsPage.tsx | Trang Admin mới |
| frontend/src/pages/AdminDocumentsPage.css | Giao diện và responsive |
| frontend/src/App.tsx | Thêm route có `AdminOnly` |
| frontend/src/layouts/AppLayout.tsx | Thêm mục sidebar Admin và breadcrumb |
| frontend/src/layouts/AccountMenu.css | Dependency FE-011 cho menu avatar |
| frontend/src/services/localProfileService.ts | Dependency FE-011 cho hồ sơ/avatar |

**Lưu ý:** Nếu bạn đã chỉnh riêng `App.tsx` hoặc `AppLayout.tsx`, xem `ADMIN04_DoiChieu.diff` và chỉ ghép import, route, menu thay vì ghi đè tất cả.

## Cài đặt qua PowerShell

```powershell
cd C:\Projects\EduMindAI
Copy-Item .\frontend\src .\frontend_src_before_admin04 -Recurse -Force

Expand-Archive `
  -LiteralPath "$env:USERPROFILE\Downloads\EduMindAI_ADMIN_04_QuanLyTaiLieu.zip" `
  -DestinationPath "C:\Projects\EduMindAI" -Force

cd C:\Projects\EduMindAI\frontend
npm run build
npm run lint
npm run dev
```

Mở `/app/admin/documents` bằng tài khoản **Admin**. Nếu vào bằng tài khoản Student, route phải chuyển về `/app`.

## Chức năng Admin-04

1. Thống kê số file API truy cập được, Ready, Queued/Processing, Failed/Error; phân bố trạng thái.
2. Thống kê tổng DB và orphan documents thông qua dashboard (nếu API sẵn sàng).
3. Tìm theo ID, tên file, tên/mã môn (hỗ trợ tiếng Việt không dấu).
4. Lọc theo môn, trạng thái, PDF/DOCX; sắp xếp ngày, tên, dung lượng.
5. Bảng/dạng thẻ, phân trang client (12 mục/trang); tự làm mới 15 giây khi chọn.
6. Xem popup chi tiết file (ID, kích thước, môn, trạng thái, ngày tải).
7. Mở file gốc qua trình xem sẵn có (Bearer token vẫn được gửi trong frontend).
8. Trích xuất văn bản xem trước theo API và hiển thị có giới hạn.
9. Xuất CSV chỉ chứa metadata của **danh sách đã lọc** (không chứa nội dung file hay email chủ sở hữu), kèm bảo vệ formula injection.
10. Loading/error/empty state, modal đóng khi Esc/click ngoài, responsive cho laptop và mobile.

## Giới hạn cần lưu ý

- `GET /api/documents` không có phân trang server: toàn bộ dữ liệu được tải về trình duyệt trước, rồi mới lọc và phân trang. Nếu dữ liệu rất lớn, cần bổ sung API Admin phân trang.
- Admin không thấy file cũ có `OwnerUserId == null` trong danh sách. Chúng vẫn được tính trong dashboard hệ thống; cần backend riêng nếu muốn xử lý.
- Tài khoản sở hữu file **không thể xác định từ phản hồi hiện tại**, không liên kết bằng suy đoán từ ID.
- Tài liệu có thể chứa dữ liệu riêng tư; chỉ mở khi có lý do quản trị hợp lệ.
- Chức năng PDF/Word phụ thuộc `PdfViewerPage.tsx` hiện có; Word có thể tải về thay vì xem trực tiếp.
- Không thay đổi Backend, không tự sửa quyền sở hữu, không thay đổi trạng thái tài liệu.

## Checklist nghiệm thu trước khi chuyển ADMIN-05

- [ ] Tài khoản Admin mở được `/app/admin/documents`; Student không mở được.
- [ ] Số tài liệu hiển thị API và số tổng DB/orphan được phân biệt rõ.
- [ ] Tìm kiếm không dấu theo tên và ID hoạt động.
- [ ] Lọc môn, trạng thái, định dạng và sắp xếp hoạt động.
- [ ] Chuyển bảng/thẻ, sang trang tiếp theo/về trước hoạt động.
- [ ] Xem chi tiết, sao chép ID, mở file và văn bản trích xuất hoạt động với tài liệu hợp lệ.
- [ ] CSV chỉ xuất dòng phù hợp bộ lọc, mở được trong Excel.
- [ ] Khi không có dữ liệu/API lỗi, trang hiện trạng thái thích hợp.
- [ ] `npm run build` và `npm run lint` thành công trên máy Windows.
- [ ] Kiểm tra 1366x768 và 390x844 không bị tràn màn hình.

Bản này không thể được đánh dấu nghiệm thu toàn bộ nếu chưa chạy kiểm thử API thật trên máy bạn.
