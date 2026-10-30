# Checks only GET APIs. It does not submit quizzes, update tasks or call paid AI.
param([string]$BaseUrl = "http://localhost:5080")
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
Write-Host "KIEM THU LO TRINH HOC V2 - READ-ONLY" -ForegroundColor Cyan
$secure = Read-Host "JWT cua tai khoan hoc vien (nhap an, KHONG GUI TOKEN CHO AI)" -AsSecureString
$token = [System.Net.NetworkCredential]::new("", $secure).Password
if ([string]::IsNullOrWhiteSpace($token)) { throw "Chua co JWT. Dang nhap FE va lay JWT tai may ban." }
$headers = @{ Authorization = "Bearer $token" }
$passed = 0; $failed = 0; $skipped = 0
function Check([bool]$condition, [string]$message) {
    if ($condition) { $script:passed++; Write-Host "PASS $message" -ForegroundColor Green }
    else { $script:failed++; Write-Host "FAIL $message" -ForegroundColor Red }
}
try {
    foreach ($case in @(
      @{ mode = 'balanced'; mins = 30 },
      @{ mode = 'balanced'; mins = 45 },
      @{ mode = 'understanding'; mins = 60 },
      @{ mode = 'exam'; mins = 90 }
    )) {
        $url = "$BaseUrl/api/learning/study-plan?dailyMinutes=$($case.mins)&planType=$($case.mode)&timezoneOffsetMinutes=-420"
        $plan = Invoke-RestMethod -Uri $url -Headers $headers -Method Get -TimeoutSec 30
        Write-Host "`n-- $($case.mode) $($case.mins) phut --" -ForegroundColor Yellow
        Check ($null -ne $plan.insights) 'Co insight tu Backend'
        Check (@($plan.history).Count -eq 7) 'Lich su 7 ngay'
        Check ($plan.dailyMinutes -eq $case.mins) 'Dung thoi luong yeu cau'
        Check ($plan.planType -eq $case.mode) 'Dung phuong phap hoc'
        if (@($plan.priorities).Count -eq 0) {
            $skipped++; Write-Host 'SKIP lich 7 ngay: tai khoan chua co tai lieu' -ForegroundColor Yellow
            continue
        }
        Check (@($plan.schedule).Count -eq 7) 'Co du 7 ngay de xuat'
        foreach ($day in @($plan.schedule)) {
            $tasks = @($day.tasks)
            Check ($tasks.Count -eq 3) "3 nhiem vu ngay $($day.date)"
            $sum = ($tasks | Measure-Object -Property estimatedMinutes -Sum).Sum
            Check ($sum -eq $case.mins) "Tong phut ngay $($day.date) = $($case.mins)"
            Check ((@($tasks | Select-Object -ExpandProperty kind -Unique)).Count -eq 3) "3 kind duy nhat $($day.date)"
        }
        $first = $plan.schedule[0]
        Check ($first.date -eq $plan.startDate) 'Ngay dau tien la ngay hien tai theo mui gio'
        Check ((@($plan.history | Where-Object {$_.completedTasks -lt 0})).Count -eq 0) 'Lich su khong co so am'
    }
} catch {
    $failed++
    Write-Host "FAIL API (kiem tra Backend, Learning API, JWT va MySQL): $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host "`nTONG: $passed PASS | $failed FAIL | $skipped SKIP" -ForegroundColor Cyan
Write-Host 'Can test thu cong: hoan thanh 1 task hom nay, lam moi, xem history/streak; quiz moi co the doi uu tien; doi ngay/clock; tai khoan khac khong thay completion.'
if ($failed -gt 0) { exit 1 }
