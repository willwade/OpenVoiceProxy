@echo off
REM CallTTS.bat - Windows batch wrapper for CallTTS.exe
REM This provides a convenient way to call the CLI tool from Windows applications

setlocal enabledelayedexpansion

REM Set default paths
set SCRIPT_DIR=%~dp0
set EXE_PATH=%SCRIPT_DIR%CallTTS.exe
set CONFIG_PATH=%SCRIPT_DIR%config.json

REM Check if CallTTS.exe exists
if not exist "%EXE_PATH%" (
    echo Error: CallTTS.exe not found in %SCRIPT_DIR%
    echo Please make sure CallTTS.exe is in the same directory as this batch file.
    pause
    exit /b 1
)

REM Check if config file exists
if not exist "%CONFIG_PATH%" (
    echo Warning: config.json not found in %SCRIPT_DIR%
    echo Using default configuration. Consider creating a config file with the CLI Config Generator.
    echo.
)

REM Run CallTTS.exe with all arguments passed to this batch file
"%EXE_PATH%" %*

REM Check exit code
if errorlevel 1 (
    echo.
    echo Error: CallTTS.exe exited with error code %errorlevel%
    echo Check the log file for details.
    pause
    exit /b %errorlevel%
)

endlocal
