#Requires -Version 5.1
param(
    [string]$ProjectPath = 'C:\Projects\EduMindAI',
    [switch]$Apply,
    [switch]$OverwriteExisting
)
$ErrorActionPreference = 'Stop'
$SourcePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\EduMindAI_Candidate'))
$ProjectPath = [System.IO.Path]::GetFullPath($ProjectPath)
$ManifestPath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\MERGE_MANIFEST.json'))
if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) { throw 'Khong tim thay thu muc EduMindAI_Candidate.' }
if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) { throw 'Khong tim thay du an that. Kiem tra -ProjectPath.' }
if (-not (Test-Path -LiteralPath $ManifestPath)) { throw 'Thieu manifest checksum.' }
$manifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$sourceFiles = Get-ChildItem -LiteralPath $SourcePath -Recurse -File
$entries = New-Object System.Collections.Generic.List[object]
foreach ($file in $sourceFiles) {
    $rel = $file.FullName.Substring($SourcePath.Length).TrimStart([char]'\',[char]'/') -replace '\\','/'
    # Never copy credentials, local uploads, local databases, dependencies or build outputs.
    if ($rel -match '(?i)(^|/)(\.git|node_modules|bin|obj|dist|storage)(/|$)' -or
        $rel -match '(?i)(^|/)(\.env($|\.)|appsettings\.(Development|Production|Local)\.json$)' -or
        $rel -match '(?i)\.(bak|pfx|p12|pem|key)$') { throw "File khong an toan trong bo source: $rel" }
    $expected = $manifest.files.PSObject.Properties[$rel]
    if ($null -eq $expected) { throw "Manifest chua khai bao file: $rel" }
    $sha = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sha -ne [string]$expected.Value.sha256) { throw "Checksum source sai: $rel" }
    $dest = Join-Path $ProjectPath ($rel -replace '/', '\')
    $state = 'NEW'
    if (Test-Path -LiteralPath $dest -PathType Leaf) {
        $shaTarget = (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant()
        $state = if ($shaTarget -eq $sha) { 'SAME' } else { 'DIFFERENT' }
    }
    $entries.Add([PSCustomObject]@{Path=$rel;State=$state;Target=$dest;Source=$file.FullName})
}
Write-Host '=== EDUMINDAI STEP1: SO SANH SOURCE ===' -ForegroundColor Cyan
Write-Host "Du an: $ProjectPath"
Write-Host "Candidate: $SourcePath"
$entries | Group-Object State | ForEach-Object { Write-Host ("{0}: {1}" -f $_.Name, $_.Count) }
Write-Host 'Cac file DIFF (toi da 35):' -ForegroundColor Yellow
$entries | Where-Object State -eq 'DIFFERENT' | Select-Object -First 35 Path | Format-Table -AutoSize
$report = Join-Path $env:TEMP ('EduMindAI_STEP1_Compare_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '.csv')
$entries | Select-Object Path, State | Export-Csv -LiteralPath $report -NoTypeInformation -Encoding UTF8
Write-Host "Bao cao so sanh: $report"
if (-not $Apply) { Write-Host 'Che do XEM TRUOC. Chua ghi de file nao.' -ForegroundColor Green; return }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Khong tim thay Git. Khong the ap dung an toan.' }
$gitDir = Join-Path $ProjectPath '.git'
if (-not (Test-Path -LiteralPath $gitDir)) { throw 'Khong thay .git trong du an. Hay dung git clone hoac khoi phuc repo truoc.' }
$branch = (& git -C $ProjectPath branch --show-current 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or $branch -ne 'tuanhung') { throw "Dang o nhanh '$branch'. Can chuyen sang 'tuanhung' truoc khi -Apply." }
$status = @(& git -C $ProjectPath status --porcelain --untracked-files=normal 2>$null)
if ($LASTEXITCODE -ne 0 -or $status.Count -gt 0) { throw 'Git worktree chua sach. Hay commit/stash/move file chua theo doi truoc khi -Apply.' }
$changed = @($entries | Where-Object State -eq 'DIFFERENT')
if ($changed.Count -gt 0 -and -not $OverwriteExisting) {
    throw "Co $($changed.Count) file khac voi code hien tai. Chua ghi de. Chi su dung -Apply -OverwriteExisting sau khi xem bao cao va chap nhan viec ghi de."
}
$todo = @($entries | Where-Object State -ne 'SAME')
if ($todo.Count -eq 0) { Write-Host 'Source da trung khop, khong can copy.'; return }
$parent = Split-Path -Parent $ProjectPath
$backup = Join-Path $parent ('EduMindAI_STEP1_BACKUP_' + (Get-Date -Format 'yyyyMMdd_HHmmss'))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
foreach ($e in $changed) {
    $dst = Join-Path $backup ($e.Path -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $dst) -Force | Out-Null
    Copy-Item -LiteralPath $e.Target -Destination $dst -Force
}
$todo | Select-Object Path,State | Export-Csv -LiteralPath (Join-Path $backup 'CAC_FILE_DA_CAP_NHAT.csv') -NoTypeInformation -Encoding UTF8
foreach ($e in $todo) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $e.Target) -Force | Out-Null
    Copy-Item -LiteralPath $e.Source -Destination $e.Target -Force
    $verify = (Get-FileHash -LiteralPath $e.Target -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = [string]$manifest.files.PSObject.Properties[$e.Path].Value.sha256
    if ($verify -ne $expected) { throw "File sau copy khong dung checksum: $($e.Path). Backup: $backup" }
}
Write-Host "Hoan tat copy $($todo.Count) file; backup file cu: $backup" -ForegroundColor Green
Write-Host 'CAN LAM TIEP: chay tools/STEP1_KIEM_TRA_BUILD.ps1 va kiem tra git diff truoc khi commit.'
