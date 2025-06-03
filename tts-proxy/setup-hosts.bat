@echo off
echo TTS Proxy Host Setup
echo.
echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Checking current status...
node manage-hosts.js status

echo.
echo To enable redirection, run this script as Administrator and choose option 2
echo.
echo 1. Check status only
echo 2. Add ElevenLabs redirect (requires admin)
echo 3. Remove ElevenLabs redirect (requires admin)
echo 4. Restore hosts file from backup (requires admin)
echo.
set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    node manage-hosts.js status
) else if "%choice%"=="2" (
    node manage-hosts.js add
) else if "%choice%"=="3" (
    node manage-hosts.js remove
) else if "%choice%"=="4" (
    node manage-hosts.js restore
) else (
    echo Invalid choice
)

pause
