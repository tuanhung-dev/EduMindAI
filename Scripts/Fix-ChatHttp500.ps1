param([switch]$ApplyMigration)

$ErrorActionPreference = "Stop"
$apiDir = Join-Path $PSScriptRoot "..\backend\EduMind.Api"
if (-not (Test-Path (Join-Path $apiDir "EduMind.Api.csproj"))) {
    throw "Khong tim thay backend/EduMind.Api. Hay chay script tu ban du an da giai nen."
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    throw "Can cai .NET SDK 10 (lenh dotnet)."
}
Push-Location $apiDir
try {
    $env:ASPNETCORE_ENVIRONMENT = "Development"
    $env:DOTNET_ENVIRONMENT = "Development"
    Write-Host "[1/3] Build backend..." -ForegroundColor Cyan
    dotnet build
    if ($LASTEXITCODE -ne 0) { throw "dotnet build khong thanh cong." }

    Write-Host "[2/3] Kiem tra migration..." -ForegroundColor Cyan
    dotnet ef migrations list
    if ($LASTEXITCODE -ne 0) {
        throw "Khong doc duoc migration. Cai dotnet-ef 10.0.9 neu can, kiem tra MySQL User Secrets."
    }

    if (-not $ApplyMigration) {
        Write-Host "Chua thay doi database." -ForegroundColor Yellow
        Write-Host "SAO LUU MySQL truoc, sau do chay: .\Scripts\Fix-ChatHttp500.ps1 -ApplyMigration tu thu muc goc du an."
        return
    }

    Write-Host "[3/3] Ap dung EF migrations. Da sao luu database chua?" -ForegroundColor Yellow
    $answer = Read-Host "Nhap YES neu DA SAO LUU MySQL"
    if ($answer -cne "YES") { throw "Huy cap nhat do chua xac nhan sao luu." }
    dotnet ef database update
    if ($LASTEXITCODE -ne 0) { throw "Migration that bai. Kiem tra log; KHONG xoa database." }
    Write-Host "Da chay EF migration thanh cong. Khoi dong lai Backend." -ForegroundColor Green
}
finally { Pop-Location }
