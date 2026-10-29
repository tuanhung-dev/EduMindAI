param([string]$ProjectRoot = 'C:\Projects\EduMindAI')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $ProjectRoot).Path
$checks = @(
  'frontend/src/App.tsx',
  'frontend/src/pages/StudyPlanPage.tsx',
  'backend/EduMind.Api/Controllers/StudyPlansController.cs'
)
foreach ($path in $checks) {
  $content = Get-Content -Raw -LiteralPath (Join-Path $root $path)
  if ($content -match '/app/flashcards|FlashcardsPage|dueCards|unreviewedCards|DueCards|UnreviewedCards') {
    throw "Van con tham chieu Flashcard trong $path"
  }
}
if (Test-Path (Join-Path $root 'backend/EduMind.Api/Controllers/FlashcardsController.cs')) {
  throw 'API FlashcardsController cu van con; chua go module.'
}
Write-Host '[PASS] Giao dien va lo trinh khong phu thuoc Flashcard.' -ForegroundColor Green
Push-Location (Join-Path $root 'backend/EduMind.Api')
try {
  & dotnet build
  if ($LASTEXITCODE -ne 0) { throw 'Backend build that bai.' }
} finally { Pop-Location }
Push-Location (Join-Path $root 'frontend')
try {
  & npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Frontend build that bai.' }
} finally { Pop-Location }
Write-Host '[PASS] Backend + Frontend build. Can kiem thu chuc nang that.' -ForegroundColor Green
