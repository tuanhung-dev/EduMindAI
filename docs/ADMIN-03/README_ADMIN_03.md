# EduMindAI — ADMIN-03: Quản lý môn học (Frontend)

## Phạm vi
Bản vá thay thế trang `/app/admin/subjects`. **Chỉ sửa frontend**, không sửa Backend, MySQL, AuthContext, Router hoặc các bước ADMIN-01/02.

### Ba file trong bản vá
- `frontend/src/pages/AdminSubjectsPage.tsx` (thay thế)
- `frontend/src/pages/AdminSubjectsPage.css` (tạo mới)
- `frontend/src/services/adminSubjectsService.ts` (tạo mới)

## Chức năng
1. Dashboard môn học: tổng / hoạt động / đã ẩn / kết quả lọc lấy từ API `/api/subjects`.
2. Tạo môn học (mã 2–20, tên 1–150, mô tả tối đa 500; chọn trạng thái).
3. Xem và chỉnh sửa thông tin đầy đủ.
4. Ẩn/hiện có xác nhận, giữ nguyên mã/tên/mô tả trong yêu cầu PUT.
5. Xóa có xác nhận nhập mã môn, cảnh báo về liên kết dữ liệu.
6. Tìm kiếm không dấu theo mã/tên/mô tả, lọc trạng thái, sắp xếp, chế độ xem bảng/thẻ.
7. Phân trang tại frontend 10 môn/trang trên danh sách do API trả về.
8. Xuất CSV những môn khớp bộ lọc (không riêng trang hiện tại); ký tự công thức được vô hiệu hóa khi xuất.
9. Trạng thái đang tải, lỗi API, lỗi trùng mã và thao tác thành công.
10. Dialog hỗ trợ Esc, di chuyển focus và bàn phím; CSS responsive.

## Sao lưu và cài đặt (PowerShell)
Đảm bảo file ZIP đã được tải về thư mục Downloads.

```powershell
cd C:\Projects\EduMindAI
Copy-Item .\frontend\src\pages\AdminSubjectsPage.tsx .\frontend\src\pages\AdminSubjectsPage.tsx.bak -Force
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\EduMindAI_ADMIN_03_QuanLyMonHoc.zip" -DestinationPath "C:\Projects\EduMindAI" -Force
cd .\frontend
npm run build
npm run lint
npm run dev
```

Đăng nhập bằng tài khoản Admin → mở `/app/admin/subjects`.

## Nghiệm thu từng bước
- [ ] `npm run build` và `npm run lint` thành công trên máy Windows.
- [ ] Danh sách môn học hiện đúng số liệu thật; học viên không được vào Admin.
- [ ] Tạo môn mới với mã chưa tồn tại; mã được chuyển thành chữ in hoa.
- [ ] Thử mã trùng → hiển thị lỗi rõ ràng, không tạo bản sao.
- [ ] Sửa tên/mô tả/trạng thái rồi tải lại → dữ liệu được lưu trên API.
- [ ] Ẩn và hiện lại môn có xác nhận.
- [ ] Xem thông tin chi tiết, ngày tạo, mã và trạng thái.
- [ ] Tìm kiếm tiếng Việt không dấu, lọc, sắp xếp, phân trang, chuyển bảng/thẻ.
- [ ] Xuất CSV, kiểm tra nội dung khớp bộ lọc.
- [ ] Thử xóa **một môn TEST mới tạo, chưa liên kết tài liệu** → nhập mã xác nhận. Không thử xóa môn đang dùng thật.
- [ ] Responsive tại 1366×768 và 390×844 không làm mất nút.

### Giới hạn quan trọng
- Backend đã có GET/POST/PUT/DELETE ở `/api/subjects`, nhưng xóa môn có dữ liệu liên kết có thể thất bại theo ràng buộc cơ sở dữ liệu. Nên ẩn thay vì xóa.
- Mọi thao tác ghi vẫn bắt buộc tài khoản có role Admin do Backend kiểm tra. Bảo vệ giao diện không thay thế phân quyền server.
- Tìm kiếm/lọc/phân trang chạy tại trình duyệt trên danh sách API trả về; không có endpoint phân trang phía server.
- Bản vá chưa được chạy với MySQL hoặc API trên máy người dùng. Nghiệm thu thực tế vẫn cần hoàn tất.
