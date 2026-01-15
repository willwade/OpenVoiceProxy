@echo off
cd /d %~dp0\..
echo Starting TTS Proxy Server...
echo.
echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Starting server on http://localhost:3000
echo Press Ctrl+C to stop
echo.
npm run start:ts

pause
