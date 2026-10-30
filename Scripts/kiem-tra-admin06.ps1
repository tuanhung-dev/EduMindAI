# ADMIN-06 / Windows PowerShell 5.1+ / Non-destructive verification
# Run from EduMindAI project root AFTER starting the backend in another window.
param(
    [string]$BaseUrl = "http://localhost:5080",
    [switch]$SkipBuild,
    [switch]$SkipApi
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'frontend'
$backend = Join-Path $root 'backend\EduMind.Api'
$failed = $false
function Step($name) { Write-Host "`n=== $name ===" -ForegroundColor Cyan }
function Pass($text) { Write-Host "[PASS] $text" -ForegroundColor Green }
function Fail($text) { Write-Host "[FAIL] $text" -ForegroundColor Red; $script:failed = $true }
function Skip($text) { Write-Host "[SKIP] $text" -ForegroundColor Yellow }
function RunBuild($directory, $exe, $arguments, $label) {
    Push-Location $directory
    try {
        & $exe @arguments
        if ($LASTEXITCODE -eq 0) { Pass $label } else { Fail "$label (exit $LASTEXITCODE)" }
    }
    finally { Pop-Location }
}
function GetHttp($uri, $headers) {
    try {
        $result = Invoke-WebRequest -Uri $uri -Headers $headers -Method Get -UseBasicParsing -TimeoutSec 12 -ErrorAction Stop
        return @{ Code = [int]$result.StatusCode; Body = $result.Content }
    }
    catch [System.Net.WebException] {
        $response = $_.Exception.Response
        if ($null -eq $response) { throw }
        return @{ Code = [int]$response.StatusCode; Body = '' }
    }
}
Step '1 / Verify files'
$files = @(
    'backend\EduMind.Api\Controllers\AdminMonitoringController.cs',
    'backend\EduMind.Api\Services\AdminAiRequestMetrics.cs',
    'frontend\src\pages\AdminMonitoringPage.tsx',
    'frontend\src\pages\AdminMonitoringPage.css',
    'frontend\src\services\adminMonitoringService.ts'
)
foreach ($file in $files) {
    if (Test-Path (Join-Path $root $file)) { Pass $file } else { Fail "Thiếu $file" }
}
if (-not $SkipBuild) {
    Step '2 / Build Backend'
    if (Get-Command dotnet -ErrorAction SilentlyContinue) { RunBuild $backend 'dotnet' @('build','--nologo') 'dotnet build' }
    else { Fail 'Chưa cài .NET SDK tương ứng (net10.0)' }
    Step '3 / Check frontend'
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        RunBuild $frontend 'npm' @('run','build') 'npm run build'
        RunBuild $frontend 'npm' @('run','lint') 'npm run lint'
    }
    else { Fail 'Chưa cài Node.js/npm' }
} else { Skip 'Builds skipped by request' }
if (-not $SkipApi) {
    Step '4 / Check API access WITHOUT credentials'
    foreach ($endpoint in @('overview?days=7','ai-status')) {
        $uri = "$BaseUrl/api/admin/monitoring/$endpoint"
        try {
            $result = GetHttp $uri @{}
            if ($result.Code -eq 401 -or $result.Code -eq 403) {
                Pass "Anonymous denied: $endpoint (HTTP $($result.Code))"
            } else {
                Fail "Anonymous request was not denied: $endpoint (HTTP $($result.Code))"
            }
        }
        catch { Fail "Cannot connect: $uri - $($_.Exception.Message)" }
    }
    Step '5 / Optional Admin token: do NOT paste token in chat'
    $answer = Read-Host 'Bạn có access token Admin đang hoạt động để thử endpoint? (y/N)'
    if ($answer -match '^[yY]$') {
        $secure = Read-Host -Prompt 'Nhập token Admin (ẩn ký tự)' -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
        $header = @{ Authorization = "Bearer $token" }
        foreach ($endpoint in @('overview?days=7','overview?days=30','ai-status')) {
            try {
                $result = GetHttp "$BaseUrl/api/admin/monitoring/$endpoint" $header
                if ($result.Code -eq 200) {
                    $data = $result.Body | ConvertFrom-Json
                    if ($endpoint -like 'overview*' -and $null -eq $data.documents) { Fail "Missing data: $endpoint" }
                    elseif ($endpoint -eq 'ai-status' -and $null -eq $data.status) { Fail "Missing AI status" }
                    else { Pass "Admin GET $endpoint (200, schema OK)" }
                } else { Fail "Admin GET $endpoint (HTTP $($result.Code))" }
            }
            catch { Fail "Admin GET $endpoint failed: $($_.Exception.Message)" }
        }
        $token = $null
        $header = $null
    } else { Skip 'Admin token tests. Check manually after Admin login.' }
} else { Skip 'API checks skipped by request' }
Step '6 / Remaining manual acceptance'
Write-Host '[REVIEW] Student account receives 403 for both admin APIs.' -ForegroundColor Yellow
Write-Host '[REVIEW] Dashboard data agrees with MySQL; Ollama model exists if configured.' -ForegroundColor Yellow
Write-Host '[REVIEW] UI at /app/admin/monitoring works at 1366x768 and 390x844.' -ForegroundColor Yellow
Write-Host '[REVIEW] Backend restart resets ONLY in-memory request counters.' -ForegroundColor Yellow
if ($failed) { Write-Host "`nSome automatic checks failed. Fix these before acceptance." -ForegroundColor Red; exit 1 }
Write-Host "`nAutomatic checks finished; manual REVIEW is still required." -ForegroundColor Green
exit 0
