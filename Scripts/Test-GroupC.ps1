# Chạy từ thư mục gốc dự án: powershell -ExecutionPolicy Bypass -File .\Scripts\Test-GroupC.ps1
# Chỉ kiểm tra biên dịch, không tự thay đổi database.
param([switch]$SkipFrontend, [switch]$SkipBackend)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Write-Host "EduMind AI Group C - kiem tra build" -ForegroundColor Cyan
if (-not $SkipBackend) {
    Push-Location (Join-Path $root 'backend\EduMind.Api')
    try {
        & dotnet build
        if ($LASTEXITCODE -ne 0) { throw "Backend build failed ($LASTEXITCODE)" }
        Write-Host '[PASS] Backend dotnet build' -ForegroundColor Green
    } finally { Pop-Location }
}
if (-not $SkipFrontend) {
    Push-Location (Join-Path $root 'frontend')
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed ($LASTEXITCODE)" }
        Write-Host '[PASS] Frontend npm run build' -ForegroundColor Green
    } finally { Pop-Location }
}
Write-Host 'Build xong. Van can kiem tra migration, API, phan quyen va giao dien thuc te.' -ForegroundColor Yellow
