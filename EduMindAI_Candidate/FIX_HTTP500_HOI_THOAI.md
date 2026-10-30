# EduMindAI – sửa lỗi "Thao tác hội thoại thất bại (HTTP 500)"

## Nguyên nhân xác nhận từ mã nguồn

Bản ZIP đã có `AiChatSession.IsPinned` và API `GET /api/ai/chats` sử dụng cột
`IsPinned`, nhưng migration `20261028061622_AddAiChatHistoryStep29_2` và migration
cuối `20261028074553_AddGroupBLearning` không có cột này.
Nếu MySQL được tạo từ migration thì truy vấn hội thoại phát sinh lỗi *Unknown column*.

## Đã sửa

1. Tạo migration `20261028120000_AddAiChatSessionPinFlag` để thêm `IsPinned` kiểu `tinyint(1)` mặc định false. **Không xóa lịch sử cũ**.
2. Đồng bộ `EduMindDbContextModelSnapshot.cs` và EF migration designer mới.
3. API `/api/ai/*` khi có lỗi database trả về HTTP 503 với mã `AI_DATABASE_ERROR`, đồng thời log thông tin đầy đủ chỉ ở backend (không lộ SQL lên giao diện).
4. Frontend đọc thông báo backend và có fallback chỉ dẫn kiểm tra migration.
5. Sửa chỉ báo `loadingChats` khi mở tài liệu.

## Cách cài trên máy Windows

**1. Sao lưu database MySQL trước khi áp dụng migration.** Không xóa database, không dùng `database drop`, không tự tạo lại bảng, không sửa migration cũ đã được áp dụng.

**2.** Giải nén ZIP thành thư mục project, rồi mở PowerShell:

```powershell
cd C:\Projects\EduMindAI
.\Scripts\Fix-ChatHttp500.ps1
```

Script chỉ build và liệt kê migration, **không cập nhật database** nếu thiếu `-ApplyMigration`.
Nếu báo chưa có `dotnet ef`, cài tool phù hợp SDK 10 (chỉ khi chưa cài):

```powershell
dotnet tool install --global dotnet-ef --version 10.0.9
```

**3.** Khi đã sao lưu MySQL:

```powershell
.\Scripts\Fix-ChatHttp500.ps1 -ApplyMigration
```

Lúc được hỏi, nhập chính xác `YES` để xác nhận đã sao lưu.
Script dùng connection string của project (`dotnet user-secrets` / environment), **không đính kèm mật khẩu trong ZIP**.
Nếu migration trước đó chưa áp dụng, EF sẽ áp dụng các migration còn thiếu theo thứ tự; đọc kỹ output để xử lý khi database đã chỉnh tay.

**4.** Chạy lại:

```powershell
cd C:\Projects\EduMindAI\backend\EduMind.Api
dotnet run --no-launch-profile --urls "http://localhost:5080"
```

Trong terminal thứ hai:

```powershell
cd C:\Projects\EduMindAI\frontend
npm ci
npm run dev
```

Mở Gia sư AI, chọn tài liệu và thử tải danh sách, tạo hội thoại, ghim / đổi tên / xóa hội thoại.

## Kiểm tra migration/database thủ công (MySQL Workbench)

Chọn đúng schema ứng dụng rồi chạy:

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME IN ('ai_chat_sessions', 'ai_chat_messages')
ORDER BY TABLE_NAME, ORDINAL_POSITION;

SELECT MigrationId
FROM __EFMigrationsHistory
ORDER BY MigrationId;
```

Kiểm tra cột `IsPinned` trong `ai_chat_sessions` và migration
`20261028120000_AddAiChatSessionPinFlag` xuất hiện trong lịch sử.
Nếu `__EFMigrationsHistory` chưa tồn tại, câu SELECT thứ hai sẽ báo thiếu bảng: cần kiểm tra lại database đang kết nối, **không tự xóa / tạo bảng**.

## Nếu còn HTTP 500 sau migration

Đọc **log backend** ngay lúc thao tác. Lỗi khác (OpenAI API key, cấu hình Ollama,
connection string, dữ liệu hỏng) vẫn có thể xảy ra và không thể kiểm chứng từ ZIP
khi không có MySQL / OpenAI đang chạy trên máy bạn. Không chia sẻ API key hay mật khẩu.

## Giới hạn kiểm thử

Đã đối chiếu source, migration, snapshot và kiểm tra bản vá tĩnh. Môi trường tạo
bản sửa không có .NET SDK và không có MySQL thực tế; cần chạy `dotnet build`,
`dotnet ef database update` và kiểm thử API trên máy Windows của bạn.
