# EduMindAI · ADMIN-02 — Quản lý người dùng & phân quyền

## Phạm vi bản vá
Chỉ thay giao diện Frontend, **không sửa backend**:

- `frontend/src/pages/AdminUsersPage.tsx` — thay file cũ
- `frontend/src/pages/AdminUsersPage.css` — tạo file mới

Không chỉnh `AdminDashboardPage.tsx`, `App.tsx`, `AppLayout.tsx`, `adminService.ts` hoặc cơ chế đăng nhập. Route cũ `/app/admin/users` vẫn được sử dụng. Đã đối chiếu với controller có sẵn: `/api/admin/users` (tìm kiếm + phân trang), `/api/admin/users/{id}/status` và `/api/admin/users/{id}/role`.

## Cài đặt an toàn trên Windows PowerShell

1. Tải ZIP `EduMindAI_ADMIN_02_QuanLyNguoiDung.zip` về Downloads.
2. Sao lưu file cũ:

```powershell
$root = "C:\Projects\EduMindAI"
Copy-Item "$root\frontend\src\pages\AdminUsersPage.tsx" "$root\frontend\src\pages\AdminUsersPage.tsx.bak" -Force
if (Test-Path "$root\frontend\src\pages\AdminUsersPage.css") {
  Copy-Item "$root\frontend\src\pages\AdminUsersPage.css" "$root\frontend\src\pages\AdminUsersPage.css.bak" -Force
}
```

3. Giải nén trực tiếp:

```powershell
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\EduMindAI_ADMIN_02_QuanLyNguoiDung.zip" -DestinationPath "C:\Projects\EduMindAI" -Force
```

4. Chạy kiểm tra frontend:

```powershell
cd C:\Projects\EduMindAI\frontend
npm run build
npm run lint
npm run dev
```

5. Đăng nhập tài khoản Admin và mở `/app/admin/users`.

## Điểm nâng cấp
- Banner và thẻ chỉ số **toàn hệ thống** lấy từ `/api/admin/dashboard`; nếu API thống kê lỗi, phần danh sách vẫn dùng được.
- Tìm kiếm server theo email/ID, phân trang theo API, mỗi trang 15 người.
- Lọc vai trò & trạng thái **chỉ ở trang hiện tại** vì API hiện không hỗ trợ lọc server theo vai trò/trạng thái.
- Bảng người dùng, hiển thị avatar, email, ID rút gọn, vai trò, trạng thái, xác minh.
- Xem thông tin chi tiết (bao gồm số lần đăng nhập lỗi), sao chép ID.
- Cấp/hạ quyền Admin, khóa/mở khóa học viên qua API thật.
- Hộp xác nhận rõ tên tài khoản, trạng thái cũ/mới và cảnh báo cấp quyền Admin.
- Chặn thao tác trên chính tài khoản đang đăng nhập và khóa Admin ở UI; backend vẫn là nơi xác minh cuối cùng.
- Thông báo tải/lỗi/thành công, thử lại, trạng thái trống, responsive và điều hướng bàn phím trong dialog.

**Giới hạn:** Không có nút xóa người dùng, tạo người dùng, reset mật khẩu người khác, lọc toàn bộ dữ liệu theo role/status hay xuất dữ liệu cá nhân vì API Admin chưa cung cấp các chức năng đó.

## Checklist nghiệm thu — chỉ chuyển sang ADMIN-03 khi đạt

- [ ] `npm run build` thành công trên Windows (không lỗi TypeScript/Vite).
- [ ] `npm run lint` thành công.
- [ ] Tài khoản Admin mở `/app/admin/users`; học viên bị router chặn.
- [ ] Các KPI là số liệu thật từ dashboard; khi dashboard lỗi vẫn xem danh sách được.
- [ ] Tìm kiếm email (một phần) và ID, bấm tìm, xóa từ khóa.
- [ ] Trang trước / sau hoạt động đúng khi nhiều hơn 15 tài khoản.
- [ ] Bộ lọc vai trò/trạng thái chỉ ảnh hưởng các mục trang hiện tại.
- [ ] Mở Chi tiết, sao chép ID và đóng bằng phím Esc.
- [ ] Cấp/hạ quyền *trên tài khoản thử nghiệm*, xác nhận lại từ danh sách.
- [ ] Khóa/mở khóa *học viên thử nghiệm*, xác nhận lại từ danh sách.
- [ ] Không có nút khả dụng để khóa Admin / tự sửa vai trò mình / tự khóa mình.
- [ ] Kiểm tra màn hình laptop 1366x768 và điện thoại 390x844, bảng có thể cuộn ngang không làm tràn toàn trang.
- [ ] Khi API lỗi, có thông báo rõ, chức năng thử lại hoạt động.

## Kiểm tra đã thực hiện
- TypeScript (`tsc -b`): **đạt** trên mã frontend làm cơ sở kiểm tra.
- ESLint riêng `AdminUsersPage.tsx`: **đạt**.
- Parser CSS (PostCSS): **đạt**.
- Chưa xác minh production build và API thật trên máy Windows của bạn.

## Giai đoạn tiếp theo
Chỉ sau khi ADMIN-02 nghiệm thu: **ADMIN-03 — Quản lý môn học**.
