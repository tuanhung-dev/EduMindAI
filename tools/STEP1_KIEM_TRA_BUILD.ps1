#Requires -Version 5.1
param([string]$ProjectPath='C:\Projects\EduMindAI')
$ErrorActionPreference = 'Continue'
$ProjectPath = [System.IO.Path]::GetFullPath($ProjectPath)
if (-not (Test-Path -LiteralPath $ProjectPath)) { throw "Khong tim thay: $ProjectPath" }
$backend = Join-Path $ProjectPath 'backend\EduMind.Api\EduMind.Api.csproj'
$front = Join-Path $ProjectPath 'frontend'
$errors = 0
Write-Host '=== EDUMINDAI: BUOC 1 KIEM TRA BUILD ===' -ForegroundColor Cyan
if (Get-Command git -ErrorAction SilentlyContinue) {
    Write-Host 'Current branch:'
    & git -C $ProjectPath branch --show-current
    Write-Host 'Thay doi Git (chi ten file, khong hien noi dung):'
    & git -C $ProjectPath status --short
    Write-Host 'Kiem tra tracked local artifacts:'
    $tracked = @(& git -C $ProjectPath ls-files)
    $bad = @($tracked | Where-Object { $_ -match '(?i)(^|/)(node_modules|storage|bin|obj|dist)/|(^|/)\.env(\.|$)|appsettings\.(Development|Production|Local)\.json$|\.bak$|\.pfx$' })
    if ($bad.Count -gt 0) { $errors++; Write-Host 'CANH BAO file local dang theo doi trong Git (chi ten):' -ForegroundColor Yellow; $bad | ForEach-Object { Write-Host $_ } }
} else { Write-Host 'Chua cai Git hoac Git khong co trong PATH.' -ForegroundColor Yellow; $errors++ }
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) { Write-Host 'Khong tim thay .NET SDK.' -ForegroundColor Red; $errors++ }
elseif (Test-Path $backend) {
    Write-Host '--- dotnet build ---' -ForegroundColor Cyan
    & dotnet build $backend -nologo
    if ($LASTEXITCODE -ne 0) { $errors++ }
} else { Write-Host 'Thieu EduMind.Api.csproj.' -ForegroundColor Red; $errors++ }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { Write-Host 'Khong tim thay npm.' -ForegroundColor Red; $errors++ }
elseif (-not (Test-Path (Join-Path $front 'node_modules'))) {
    Write-Host 'Chua co frontend/node_modules. Chay: cd frontend; npm ci' -ForegroundColor Yellow; $errors++
} else {
    Push-Location $front
    try {
        Write-Host '--- npm run build ---' -ForegroundColor Cyan
        & npm run build
        if ($LASTEXITCODE -ne 0) { $errors++ }
        Write-Host '--- npm run lint ---' -ForegroundColor Cyan
        & npm run lint
        if ($LASTEXITCODE -ne 0) { $errors++ }
    } finally { Pop-Location }
}
if ($errors -eq 0) { Write-Host 'PASS: static/build checks. Chua kiem tra runtime MySQL/Ollama.' -ForegroundColor Green }
else { Write-Host "FAIL / WARNING: $errors muc can xu ly." -ForegroundColor Yellow }
if ($errors -gt 0) { exit 1 }
