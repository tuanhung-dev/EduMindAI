param(
  [string]$ProjectPath = "C:\Projects\EduMindAI",
  [string]$ApiBaseUrl = "http://localhost:5080"
)
$ErrorActionPreference = "Stop"
$backend = Join-Path $ProjectPath "backend\EduMind.Api"
$frontend = Join-Path $ProjectPath "frontend"
Write-Host "=== KIEM TRA AI TUTOR / TOM TAT V3 ===" -ForegroundColor Cyan
$files = @(
  "backend\EduMind.Api\Controllers\DocumentSummariesController.cs",
  "frontend\src\pages\AiTutorPage.tsx",
  "frontend\src\pages\AiTutorSummaryV3.css",
  "frontend\src\pages\AiTutorUnified.css"
)
foreach ($file in $files) {
  if (-not (Test-Path (Join-Path $ProjectPath $file))) { throw "Thieu file: $file" }
  Write-Host "[OK] $file" -ForegroundColor Green
}
Push-Location $backend
try {
  Write-Host "\n[Backend] dotnet build" -ForegroundColor Yellow
  dotnet build
  if ($LASTEXITCODE -ne 0) { throw "dotnet build that bai" }
} finally { Pop-Location }
Push-Location $frontend
try {
  Write-Host "\n[Frontend] npm run build" -ForegroundColor Yellow
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "npm run build that bai" }
  Write-Host "\n[Frontend] npm run lint" -ForegroundColor Yellow
  npm run lint
  if ($LASTEXITCODE -ne 0) { throw "npm run lint that bai" }
} finally { Pop-Location }
try {
  $result = Invoke-WebRequest -Uri "$ApiBaseUrl/api/documents/1/summaries" -Method Get -TimeoutSec 10 -UseBasicParsing
  Write-Host "[REVIEW] API HTTP $([int]$result.StatusCode); can kiem tra quyen truy cap" -ForegroundColor Yellow
} catch {
  $response = $_.Exception.Response
  if ($null -ne $response) {
    $code = [int]$response.StatusCode
    if ($code -eq 401) { Write-Host "[OK] API yeu cau dang nhap (401)" -ForegroundColor Green }
    else { Write-Host "[REVIEW] API HTTP $code" -ForegroundColor Yellow }
  } else {
    Write-Host "[REVIEW] Khong ket noi Backend: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}
Write-Host "\n[MANUAL] Kiem tra PDF/Word Ready, tao short + detailed, kiem tra muc luc/nguon/lich su." -ForegroundColor Cyan
Write-Host "KHONG co request tao tom tat duoc thuc hien tu script nay (tranh phi AI)."
