# Test TTS Proxy Server
Write-Host "Setting up fnm environment..." -ForegroundColor Yellow
fnm env --use-on-cd | Out-String | Invoke-Expression
fnm use v22.16.0

Write-Host "Starting TTS Proxy Server test..." -ForegroundColor Green
node src/test-server-only.js
