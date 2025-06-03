@echo off
echo TTS Proxy Server (Administrator Mode)
echo =====================================
echo.
echo This will start the TTS proxy with HTTPS support on port 443
echo Administrator privileges are required for port 443 binding
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    echo ✅ Running as Administrator
    echo.
) else (
    echo ❌ Not running as Administrator
    echo.
    echo Please right-click this file and select "Run as Administrator"
    echo.
    pause
    exit /b 1
)

echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Starting TTS Proxy Server with HTTPS support...
echo HTTP:  http://localhost:3000
echo HTTPS: https://api.elevenlabs.io (port 443)
echo.
echo Press Ctrl+C to stop
echo.

node src/test-server-only.js

pause
