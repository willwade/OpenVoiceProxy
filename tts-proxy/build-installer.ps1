# Build OpenVoiceProxy Installer
# This script builds the Electron app without code signing to avoid symbolic link issues

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "OpenVoiceProxy Installer Build Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Clear electron-builder cache to avoid symbolic link issues
Write-Host "[1/4] Clearing electron-builder cache..." -ForegroundColor Yellow
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cacheDir) {
    Remove-Item -Path $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Cache cleared!" -ForegroundColor Green
} else {
    Write-Host "      No cache to clear." -ForegroundColor Gray
}

# Step 2: Clean dist folder
Write-Host "[2/4] Cleaning dist folder..." -ForegroundColor Yellow
if (Test-Path "dist") {
    # Try to remove, if locked, rename it
    try {
        Remove-Item -Path "dist" -Recurse -Force -ErrorAction Stop
        Write-Host "      Dist folder removed!" -ForegroundColor Green
    } catch {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Rename-Item -Path "dist" -NewName "dist.old.$timestamp" -Force
        Write-Host "      Dist folder renamed to dist.old.$timestamp" -ForegroundColor Yellow
    }
} else {
    Write-Host "      No dist folder to clean." -ForegroundColor Gray
}

# Step 3: Set environment variable to disable code signing
Write-Host "[3/4] Setting environment variables..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
# Remove any existing code signing variables
Remove-Item Env:\WIN_CSC_LINK -ErrorAction SilentlyContinue
Remove-Item Env:\WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\CSC_LINK -ErrorAction SilentlyContinue
Remove-Item Env:\CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
Write-Host "      CSC_IDENTITY_AUTO_DISCOVERY=false" -ForegroundColor Green
Write-Host "      Code signing variables cleared" -ForegroundColor Green

# Step 4: Build the installer
Write-Host "[4/4] Building Electron app..." -ForegroundColor Yellow
Write-Host ""
npm run build:electron

# Check if build was successful
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # List the output files
    Write-Host "Output files:" -ForegroundColor Cyan
    Get-ChildItem -Path "dist" -Filter "*.exe" | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($sizeMB MB)" -ForegroundColor White
    }
    
    # Check for installer
    $installer = Get-ChildItem -Path "dist" -Filter "OpenVoiceProxy Setup*.exe" | Select-Object -First 1
    if ($installer) {
        Write-Host ""
        Write-Host "Installer ready to share:" -ForegroundColor Green
        Write-Host "  $($installer.FullName)" -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "Note: Installer not found. Unpacked app is available at:" -ForegroundColor Yellow
        Write-Host "  dist\win-unpacked\OpenVoiceProxy.exe" -ForegroundColor White
    }
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "If you see symbolic link errors, try running PowerShell as Administrator." -ForegroundColor Yellow
}

