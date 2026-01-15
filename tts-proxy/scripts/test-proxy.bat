@echo off
cd /d %~dp0\..
echo Testing TTS Proxy Endpoints...
echo.
echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Running endpoint tests...
npx tsx scripts/test-endpoints.ts

pause
