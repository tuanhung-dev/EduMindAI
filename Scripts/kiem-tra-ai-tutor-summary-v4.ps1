param(
  [string]$ProjectPath = 'C:\Projects\EduMindAI',
  [switch]$Build
)
$ErrorActionPreference = 'Stop'
$api = Join-Path $ProjectPath 'backend\EduMind.Api\Controllers\DocumentSummariesController.cs'
$tsx = Join-Path $ProjectPath 'frontend\src\pages\AiTutorPage.tsx'
$css = Join-Path $ProjectPath 'frontend\src\pages\AiTutorSummaryV3.css'
$failed = 0
function Check([bool]$condition, [string]$name) {
  if ($condition) { Write-Host "[PASS] $name" -ForegroundColor Green }
  else { Write-Host "[FAIL] $name" -ForegroundColor Red; $script:failed++ }
}
Check (Test-Path $api) 'API tóm tắt tồn tại'
Check (Test-Path $tsx) 'Trang Gia sư AI tồn tại'
Check (Test-Path $css) 'CSS chế độ đọc tồn tại'
if ((Test-Path $api) -and (Test-Path $tsx) -and (Test-Path $css)) {
  $code = Get-Content $api -Raw -Encoding UTF8
  $view = Get-Content $tsx -Raw -Encoding UTF8
  $style = Get-Content $css -Raw -Encoding UTF8
  Check ($code.Contains('DefaultDetailedChunkLimit = 120')) 'Giới hạn mặc định chi tiết 120 đoạn'
  Check ($code.Contains('AI:Summaries:DetailedMaxChunks')) 'Cho cấu hình 24-320 đoạn'
  Check ($code.Contains('string.Join("\n\n---\n\n", chapters)')) 'Ghép đủ các phần không ép qua bước reduce cuối'
  Check (!$code.Contains('## 7. Câu hỏi tự kiểm tra')) 'Không còn mẫu tóm tắt kèm câu hỏi'
  Check ($view.Contains('Đọc toàn màn hình')) 'Có chế độ đọc dài'
  Check ($style.Contains('.emsum-result-expanded')) 'Có CSS mở rộng khung đọc'
  Check (!$view.Contains('6–8 câu hỏi')) 'Không yêu cầu câu hỏi trong giao diện tóm tắt'
}
if ($Build) {
  if (Get-Command dotnet -ErrorAction SilentlyContinue) {
    & dotnet build (Join-Path $ProjectPath 'backend\EduMind.Api\EduMind.Api.csproj')
    Check ($LASTEXITCODE -eq 0) 'dotnet build'
  } else { Write-Warning 'Không có dotnet trong PATH; bỏ qua build Backend.' }
  if (Get-Command npm -ErrorAction SilentlyContinue) {
    Push-Location (Join-Path $ProjectPath 'frontend')
    try {
      & npm run build
      Check ($LASTEXITCODE -eq 0) 'npm run build'
      & npm run lint
      Check ($LASTEXITCODE -eq 0) 'npm run lint'
    } finally { Pop-Location }
  } else { Write-Warning 'Không có npm trong PATH; bỏ qua build Frontend.' }
}
Write-Host "`nLưu ý: script không gọi AI; phải kiểm thử tạo tóm tắt với một tài liệu Ready trên trình duyệt."
if ($failed -gt 0) { exit 1 }
