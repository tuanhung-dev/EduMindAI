param(
    [string]$ApiBase = 'http://localhost:5080'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$front = Join-Path $root 'frontend'
$back = Join-Path $root 'backend\EduMind.Api'
$failures = 0
function Check-Step([string]$Label, [scriptblock]$Code) {
    Write-Host "`n==> $Label" -ForegroundColor Cyan
    try { & $Code; Write-Host '[PASS]' -ForegroundColor Green }
    catch { Write-Host "[FAIL] $($_.Exception.Message)" -ForegroundColor Red; $script:failures++ }
}

Check-Step 'Frontend: kiểm tra Typescript + Vite build' {
    Push-Location $front
    try { npm run build; if ($LASTEXITCODE -ne 0) { throw "npm run build thất bại (mã $LASTEXITCODE)" } }
    finally { Pop-Location }
}
Check-Step 'Frontend: ESLint toàn dự án' {
    Push-Location $front
    try { npm run lint; if ($LASTEXITCODE -ne 0) { throw "npm run lint thất bại (mã $LASTEXITCODE)" } }
    finally { Pop-Location }
}
Check-Step 'Backend: dotnet build dự án' {
    dotnet build (Join-Path $back 'EduMind.Api.csproj') --no-restore
    if ($LASTEXITCODE -ne 0) { throw "dotnet build thất bại (mã $LASTEXITCODE). Hãy thử dotnet restore trước." }
}

$uri = ($ApiBase.TrimEnd('/') + '/api/admin/exams/overview')
$token = $env:EDUMIND_ADMIN_TEST_TOKEN
if ($token) {
    Check-Step 'API thật: thống kê Admin bằng Bearer Token' {
        $headers = @{ Authorization = "Bearer $token" }
        $overview = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
        if ($null -eq $overview.totalQuizzes -or $null -eq $overview.completedAttempts) { throw 'Thiếu trường tổng quan.' }
        Write-Host "Số đề: $($overview.totalQuizzes); số bài đã nộp: $($overview.completedAttempts)"
        foreach ($endpoint in @('quizzes?page=1&pageSize=1','attempts?page=1&pageSize=1')) {
            $result = Invoke-RestMethod -Method Get -Uri "$($ApiBase.TrimEnd('/'))/api/admin/exams/$endpoint" -Headers $headers
            if ($null -eq $result.total -or $null -eq $result.items) { throw "API $endpoint không có cấu trúc phân trang." }
            Write-Host "$endpoint : $($result.total) bản ghi"
        }
    }
} else {
    Write-Host "`n[REVIEW] Chưa có EDUMIND_ADMIN_TEST_TOKEN. Bỏ qua kiểm tra API Admin có đăng nhập." -ForegroundColor Yellow
}
Write-Host "`nADMIN-05: $failures bước FAIL. Các luồng phân quyền, dữ liệu thật, xóa thử và giao diện cần nghiệm thu thủ công." -ForegroundColor Cyan
if ($failures -gt 0) { exit 1 }
