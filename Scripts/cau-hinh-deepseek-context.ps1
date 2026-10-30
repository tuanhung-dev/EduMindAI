# Execute this from C:\Projects\EduMindAI in a PowerShell window.
# NOTE: These variables apply only to THIS PowerShell session.
# Configure ConnectionStrings__DefaultConnection separately (User Secrets recommended).
$ErrorActionPreference = 'Stop'
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:DOTNET_ENVIRONMENT = 'Development'
$env:AI__Provider = 'Ollama'
$env:AI__Ollama__BaseUrl = 'http://127.0.0.1:11434'
$env:AI__Ollama__Model = 'deepseek-r1:8b'
$env:AI__Ollama__NumCtx = '4096'
$env:AI__Tutor__MaxOutputTokens = '768'
$env:Rag__MaxSources = '4'
Write-Host 'Configured Ollama DeepSeek R1 8B with safe local context limits.' -ForegroundColor Green
Write-Host 'Next: cd .\backend\EduMind.Api ; dotnet build ; dotnet run --no-launch-profile --urls "http://localhost:5080"'
Write-Host 'Reminder: Configure MySQL connection before running the backend.' -ForegroundColor Yellow
