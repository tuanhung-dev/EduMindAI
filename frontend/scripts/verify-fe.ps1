# EduMindAI FE-013: chay tren Windows PowerShell / PowerShell 7.
# Khong sua Backend, khong lam thay doi database.
param(
    [string]$ApiUrl = "http://localhost:5080",
    [switch]$SkipApi
)

$ErrorActionPreference = "Stop"
$frontend = Split-Path -Parent $PSScriptRoot
Set-Location $frontend

function Step([string]$name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }
function Check($exitCode, [string]$title) {
    if ($exitCode -ne 0) { throw "$title THAT BAI (exit $exitCode)." }
    Write-Host "${title}: DAT" -ForegroundColor Green
}

Step "1. Kiem tra phu thuoc va cau hinh"
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "Chua cai Node.js/npm." }
if (-not (Test-Path "node_modules")) {
    Write-Host "Chua co node_modules. Dang chay npm ci..." -ForegroundColor Yellow
    & npm.cmd ci
    Check $LASTEXITCODE "npm ci"
}
if (Test-Path ".env") {
    Write-Host "Da co file .env. Kiem tra VITE_API_BASE_URL phu hop voi Backend cua ban."
} else {
    Write-Host "Chua co .env: frontend su dung mac dinh http://localhost:5080" -ForegroundColor Yellow
}

Step "2. ESLint toan frontend"
& npm.cmd run lint
Check $LASTEXITCODE "ESLint"

Step "3. TypeScript + production build"
& npm.cmd run build
Check $LASTEXITCODE "Build"
if (-not (Test-Path "dist/index.html")) { throw "Khong tim thay dist/index.html sau build." }
Write-Host "dist/index.html ton tai" -ForegroundColor Green

Step "4. Kiem tra API Backend (khong yeu cau dang nhap)"
if ($SkipApi) {
    Write-Host "Da bo qua test API theo -SkipApi." -ForegroundColor Yellow
} else {
    try {
        $uri = ([uri]$ApiUrl)
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $hostName = $uri.Host
            $port = if ($uri.IsDefaultPort) { if ($uri.Scheme -eq "https") {443} else {80} } else { $uri.Port }
            $result = $client.BeginConnect($hostName, $port, $null, $null)
            $connected = $result.AsyncWaitHandle.WaitOne(4000, $false)
            if (-not $connected) { throw "Khong ket noi duoc $hostName`:$port." }
            $client.EndConnect($result)
            Write-Host "Da ket noi duoc $ApiUrl (TCP)." -ForegroundColor Green
        } finally { $client.Close() }
    } catch {
        Write-Warning "Chua xac nhan duoc API: $($_.Exception.Message)"
        Write-Host "Build FE van co the thanh cong khi Backend chua chay." -ForegroundColor Yellow
    }
}

Step "5. Checklist kiem thu thu cong con bat buoc"
Write-Host "- Chay: npm run dev (hoac npm run preview)."
Write-Host "- Dang nhap, thu xem /app/documents va /app/documents/<id>."
Write-Host "- Thu 1 PDF, 1 DOCX, upload > limit, trang thai Ready/Failed."
Write-Host "- Thu 401/403 (phien het han/quyen khong du) va loi mat mang."
Write-Host "- Thu resize 1366x768 va 390x844, khong tran ngang."
Write-Host "- Kiem tra refresh URL sau khi deploy; host phai fallback ve index.html."
Write-Host "- Kiem tra CORS tren DevTools Network khi frontend/backend khac origin."
Write-Host "DA KIEM TRA BUILD; CHUA TU DONG XAC NHAN CORS/ROUTE/LOGIN THUC TE." -ForegroundColor Yellow
