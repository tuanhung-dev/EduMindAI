param(
    [string]$ProjectRoot = 'C:\Projects\EduMindAI',
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path $ProjectRoot).Path
$packageRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$replacements = @(
    'frontend/src/App.tsx',
    'frontend/src/layouts/AppLayout.tsx',
    'frontend/src/pages/DashboardPage.tsx',
    'frontend/src/pages/FocusHome.css',
    'frontend/src/pages/StudyPlanPage.tsx',
    'frontend/src/pages/StudyPlanFocus.css',
    'frontend/src/services/studyPlanService.ts',
    'backend/EduMind.Api/Controllers/StudyPlansController.cs',
    'Scripts/Test-EduMindFocus.ps1'
)
# The following files are no longer loaded/routed. Back up before removing.
# EF entity models and migrations are deliberately retained to protect historical DB data.
$retire = @(
    'frontend/src/pages/FlashcardsPage.tsx',
    'frontend/src/pages/FlashcardsPage.css',
    'frontend/src/services/flashcardService.ts',
    'frontend/src/services/learningDashboardService.ts',
    'frontend/src/services/learningInsightsService.ts',
    'frontend/src/pages/GroupBInsights.css',
    'backend/EduMind.Api/Controllers/FlashcardsController.cs',
    'backend/EduMind.Api/Controllers/LearningDashboardController.cs',
    'backend/EduMind.Api/Controllers/LearningInsightsController.cs'
)
if (-not (Test-Path (Join-Path $root 'backend/EduMind.Api/EduMind.Api.csproj')) -or
    -not (Test-Path (Join-Path $root 'frontend/package.json'))) {
    throw 'ProjectRoot khong phai thu muc EduMindAI hop le.'
}
foreach ($relative in $replacements) {
    if (-not (Test-Path (Join-Path $packageRoot $relative))) {
        throw "Thieu file trong ZIP: $relative"
    }
}
$branch = (& git -C $root branch --show-current 2>$null)
if ($branch -eq 'main' -or $branch -eq 'master') {
    throw 'Ban dang o nhanh main/master. Chuyen sang nhanh tuanhung truoc khi thay.'
}
Write-Host "Du an: $root" -ForegroundColor Cyan
Write-Host "Nhanh Git: $branch"
Write-Host 'File thay/them:'
$replacements | ForEach-Object { Write-Host "  + $_" }
Write-Host 'File ngung su dung (se sao luu truoc khi go):'
$retire | ForEach-Object { Write-Host "  - $_" }
if (-not $Apply) {
    Write-Host 'MOI CHI XEM TRUOC. De ap dung: them tham so -Apply' -ForegroundColor Yellow
    exit 0
}
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$backupRoot = Join-Path $env:USERPROFILE "Documents\EduMindAI_Backups\Focus_$stamp"
$all = @($replacements + $retire)
foreach ($relative in $all) {
    $current = Join-Path $root $relative
    if (Test-Path $current) {
        $backup = Join-Path $backupRoot $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $backup) -Force | Out-Null
        Copy-Item -LiteralPath $current -Destination $backup -Force
    }
}
Write-Host "Da sao luu file cu: $backupRoot" -ForegroundColor Green
foreach ($relative in $replacements) {
    $target = Join-Path $root $relative
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $packageRoot $relative) -Destination $target -Force
}
foreach ($relative in $retire) {
    $target = Join-Path $root $relative
    if (Test-Path $target) { Remove-Item -LiteralPath $target -Force }
}
Write-Host 'Da thay file va go module cu. KHONG thay doi MySQL.' -ForegroundColor Green
Write-Host 'Tiep theo: dotnet build, npm run build, sau do kiem thu website.'
