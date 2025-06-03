@echo off
echo TTS Voice Configuration...
echo.
echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo 1. Discover and configure voices automatically
echo 2. Show current voice configuration
echo 3. Test a specific voice mapping
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="1" (
    echo Discovering voices...
    node configure-voices.js discover
) else if "%choice%"=="2" (
    echo Showing configuration...
    node configure-voices.js show
) else if "%choice%"=="3" (
    set /p voiceId="Enter voice ID to test: "
    node configure-voices.js test %voiceId%
) else (
    echo Invalid choice
)

pause
