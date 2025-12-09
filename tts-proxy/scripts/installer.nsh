; Custom installer script for OpenVoiceProxy

; Page to select additional components
!macro customInstallComponents
  !insertmacro MUI_PAGE_COMPONENTS
!macroend

; Define additional components
!macro customInit
  ; Add CLI Tool component
  !insertmacro MUI_INSTALLOPTIONS_WRITE "ioSpecialIni" "settings" "NumComponents" "2"
  !insertmacro MUI_INSTALLOPTIONS_WRITE "ioSpecialIni" "settings" "ComponentText1" "Install CLI Tool"
  !insertmacro MUI_INSTALLOPTIONS_WRITE "ioSpecialIni" "settings" "ComponentText2" "Create Desktop Shortcut"
!macroend

; Section for CLI Tool
Section "CLI Tool" SecCLI
  SectionIn RO ; Read-only section (cannot be deselected)

  ; Create directory for CLI tool
  CreateDirectory "$INSTDIR\cli"

  ; Copy CLI files
  File /r "${NSISDIR}\..\cli\*.*" "$INSTDIR\cli\"

  ; Add CLI directory to PATH
  ${EnvVarUpdate} $0 "PATH" "A" "HKLM" "$INSTDIR\cli"

  ; Write registry entries for CLI tool
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI" "DisplayName" "${PRODUCT_NAME} CLI Tool"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI" "UninstallString" "$INSTDIR\uninstall_cli.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI" "DisplayIcon" "$INSTDIR\cli\CallTTS.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI" "Publisher" "${PRODUCT_PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI" "DisplayVersion" "${PRODUCT_VERSION}"

  ; Create uninstaller for CLI
  WriteUninstaller "$INSTDIR\uninstall_cli.exe"
SectionEnd

; Custom uninstall function
Function un.customUnInit
  ; Remove CLI directory from PATH
  ${un.EnvVarUpdate} $0 "PATH" "R" "HKLM" "$INSTDIR\cli"

  ; Delete registry entries for CLI tool
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${PRODUCT_NAME}_CLI"
FunctionEnd

; CLI Tool uninstall section
Section "un.CLI Tool" un.SecCLI
  ; Delete CLI files
  RMDir /r "$INSTDIR\cli"

  ; Delete CLI uninstaller
  Delete "$INSTDIR\uninstall_cli.exe"
SectionEnd

; Create start menu shortcuts
Function customFinish
  CreateShortCut "$SMPROGRAMS\OpenVoiceProxy.lnk" "$INSTDIR\OpenVoiceProxy.exe" "" "$INSTDIR\OpenVoiceProxy.exe" 0
  CreateShortCut "$SMPROGRAMS\CLI Config Generator.lnk" "http://localhost:3000/admin/cli-config" "" "$INSTDIR\OpenVoiceProxy.exe" 0
  CreateShortCut "$SMPROGRAMS\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
FunctionEnd
