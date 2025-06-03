@echo off
echo Simulating Grid3 TTS Workflow...
echo.
echo Setting up Node.js environment with fnm...
for /f "delims=" %%i in ('fnm env --use-on-cd') do %%i
fnm use v22.16.0

echo.
echo Running Grid3 simulation...
node simulate-grid3.js

pause
