param(
  [Parameter(Mandatory=$true)][int]$DocumentId,
  [string]$GroundTruthFile = '.\Tests\RagQualityChecks\ground_truth.json',
  [string]$ApiBaseUrl = 'http://localhost:5080',
  [string]$OutputFile = '.\Tests\RagQualityChecks\results.local.json'
)
$ErrorActionPreference = 'Stop'
# Never hard-code/export the bearer token in test files or reports.
if (-not $env:EDUMIND_TEST_TOKEN) { throw 'Set EDUMIND_TEST_TOKEN in the terminal (do not commit/share it).' }
if (-not (Test-Path $GroundTruthFile)) { throw "Ground truth not found: $GroundTruthFile" }
$items = Get-Content -Raw -Encoding UTF8 $GroundTruthFile | ConvertFrom-Json
$headers = @{ Authorization = "Bearer $env:EDUMIND_TEST_TOKEN" }
$results = @()
foreach ($item in $items) {
    if (-not $item.question -or -not $item.expectedAnyPage) { throw 'Each test needs question and expectedAnyPage.' }
    $body = @{ documentId = $DocumentId; question = [string]$item.question } | ConvertTo-Json
    $started = Get-Date
    $response = Invoke-RestMethod -Uri "$ApiBaseUrl/api/ai/ask" -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    $pages = @($response.sources | ForEach-Object { [int]$_.pageNumber })
    $hit = @($item.expectedAnyPage | Where-Object { $pages -contains [int]$_ }).Count -gt 0
    $rows = @($response.sources).Count
    $results += [pscustomobject]@{ question = $item.question; expectedAnyPage = $item.expectedAnyPage; retrievedPages = $pages; hit = $hit; latencySeconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 2); answer = $response.answer; retrievedCount = $rows }
    Write-Host "$(if ($hit) { '[PASS]' } else { '[MISS]' }) $($item.question)"
    # Default rate limiter: 6 AI calls/min/account. Respect it in evaluations.
    Start-Sleep -Seconds 11
}
$results | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 $OutputFile
$correct = @($results | Where-Object { $_.hit }).Count
Write-Host "Page-evidence recall@$($results.Count): $correct/$($results.Count)"
Write-Host "Results in $OutputFile. Manually grade groundedness and answer correctness; page hit alone is not proof."
