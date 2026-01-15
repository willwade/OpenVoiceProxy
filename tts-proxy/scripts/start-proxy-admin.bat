@echo off
cd /d %~dp0\..
echo TTS Proxy Server
echo ===============
echo.
echo This will start the TTS proxy server
echo.

echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Starting TTS Proxy Server...
echo HTTP:  http://localhost:3000
echo.
echo Press Ctrl+C to stop
echo.

npm run start:ts

pause
