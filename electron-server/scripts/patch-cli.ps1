param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath
)

if (-not (Test-Path $ExePath)) {
  Write-Error "CallTTS binary not found at $ExePath"
  exit 1
}

$vswhere = Join-Path "${env:ProgramFiles(x86)}" "Microsoft Visual Studio\Installer\vswhere.exe"
if (-not (Test-Path $vswhere)) {
  Write-Warning "vswhere.exe not found; skipping console suppression patch."
  exit 0
}

$installDir = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installDir) {
  Write-Warning "Visual Studio build tools not found; skipping console suppression patch."
  exit 0
}

$editbin = Get-ChildItem -Path (Join-Path $installDir "VC\Tools\MSVC\*\bin\Hostx64\x64\editbin.exe") |
  Sort-Object FullName -Descending |
  Select-Object -First 1 -ExpandProperty FullName

if (-not $editbin) {
  Write-Warning "editbin.exe not found; skipping console suppression patch."
  exit 0
}

& $editbin /SUBSYSTEM:WINDOWS $ExePath
if ($LASTEXITCODE -ne 0) {
  Write-Warning "editbin failed with exit code $LASTEXITCODE"
  exit 0
}

Write-Host "CallTTS console window suppressed via editbin."
