# Test TTS Proxy Server
Set-Location -Path (Split-Path -Parent $PSScriptRoot)
Write-Host "Setting up fnm environment..." -ForegroundColor Yellow
fnm env --use-on-cd | Out-String | Invoke-Expression
fnm use v22.16.0

Write-Host "Starting TTS Proxy Server test..." -ForegroundColor Green
npm run start:ts
