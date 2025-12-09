# Force Build - Aggressively unlock and rebuild
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Force Build with File Unlock" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Kill any processes that might be locking files
Write-Host "[1/5] Killing processes that might lock files..." -ForegroundColor Yellow

# Kill VS Code processes
$codeProcesses = Get-Process -Name "Code" -ErrorAction SilentlyContinue
if ($codeProcesses) {
    Write-Host "      Found $($codeProcesses.Count) VS Code process(es)" -ForegroundColor Gray
    $codeProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "      VS Code processes killed" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# Kill any Electron processes
$electronProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    Write-Host "      Found $($electronProcesses.Count) Electron process(es)" -ForegroundColor Gray
    $electronProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "      Electron processes killed" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# Kill any OpenVoiceProxy processes
$appProcesses = Get-Process -Name "OpenVoiceProxy" -ErrorAction SilentlyContinue
if ($appProcesses) {
    Write-Host "      Found $($appProcesses.Count) OpenVoiceProxy process(es)" -ForegroundColor Gray
    $appProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "      OpenVoiceProxy processes killed" -ForegroundColor Green
    Start-Sleep -Seconds 2
}

# Step 2: Clear electron-builder cache
Write-Host "[2/5] Clearing electron-builder cache..." -ForegroundColor Yellow
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
if (Test-Path $cacheDir) {
    Remove-Item -Path $cacheDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "      Cache cleared!" -ForegroundColor Green
}

# Step 3: Aggressively clean dist folder
Write-Host "[3/5] Cleaning dist folder (aggressive)..." -ForegroundColor Yellow

# First, try to unlock the specific file
$lockedFile = "dist\win-unpacked\resources\app.asar"
if (Test-Path $lockedFile) {
    Write-Host "      Attempting to unlock $lockedFile..." -ForegroundColor Gray
    
    # Method 1: Try direct delete with retry
    $retries = 3
    $deleted = $false
    for ($i = 1; $i -le $retries; $i++) {
        try {
            Remove-Item -Path $lockedFile -Force -ErrorAction Stop
            $deleted = $true
            Write-Host "      File unlocked and deleted!" -ForegroundColor Green
            break
        } catch {
            Write-Host "      Attempt $i/$retries failed, retrying..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        }
    }
    
    # Method 2: If still locked, rename the entire dist folder
    if (-not $deleted) {
        Write-Host "      File still locked, renaming dist folder..." -ForegroundColor Yellow
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $oldName = "dist.locked.$timestamp"
        
        # Use robocopy to move (works even with locked files)
        if (Test-Path "dist") {
            Move-Item -Path "dist" -Destination $oldName -Force -ErrorAction SilentlyContinue
            Write-Host "      Dist folder moved to $oldName" -ForegroundColor Yellow
        }
    }
}

# Final check and cleanup
if (Test-Path "dist") {
    Remove-Item -Path "dist" -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "      Dist folder cleaned!" -ForegroundColor Green

# Step 4: Set environment variables
Write-Host "[4/5] Setting environment variables..." -ForegroundColor Yellow
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
Remove-Item Env:\WIN_CSC_LINK -ErrorAction SilentlyContinue
Remove-Item Env:\WIN_CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
Remove-Item Env:\CSC_LINK -ErrorAction SilentlyContinue
Remove-Item Env:\CSC_KEY_PASSWORD -ErrorAction SilentlyContinue
Write-Host "      Environment configured" -ForegroundColor Green

# Step 5: Build
Write-Host "[5/5] Building Electron app..." -ForegroundColor Yellow
Write-Host ""

npm run build:all

# Check results
if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "BUILD SUCCESSFUL!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    
    # List output files
    Write-Host "Output files:" -ForegroundColor Cyan
    Get-ChildItem -Path "dist" -Filter "*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($sizeMB MB)" -ForegroundColor White
    }
    
    # Find installer
    $installer = Get-ChildItem -Path "dist" -Filter "OpenVoiceProxy Setup*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($installer) {
        Write-Host ""
        Write-Host "✓ INSTALLER READY TO SHARE:" -ForegroundColor Green
        Write-Host "  $($installer.FullName)" -ForegroundColor White
        Write-Host ""
        Write-Host "File size: $([math]::Round($installer.Length / 1MB, 2)) MB" -ForegroundColor Cyan
    }
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "BUILD FAILED!" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "The file may still be locked by another process." -ForegroundColor Yellow
    Write-Host "Try closing ALL applications and running this script again." -ForegroundColor Yellow
}

