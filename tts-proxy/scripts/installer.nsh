; Custom installer script for OpenVoiceProxy
; Per-user installation (no admin required)

; Custom install mode - set to current user
!macro customInstallMode
  SetShellVarContext current
!macroend

; Initialize - ask about startup
!macro customInit
  ; We'll use a simple MessageBox instead of custom page
!macroend

; After installation files are copied
!macro customInstall
  ; Ask user if they want to run on startup
  MessageBox MB_YESNO "Do you want OpenVoiceProxy to start automatically when Windows starts?" IDYES startup IDNO nostartup
  startup:
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVoiceProxy" "$INSTDIR\OpenVoiceProxy.exe"
    Goto done
  nostartup:
    ; Don't add to startup
  done:
!macroend

; After installation is complete
!macro customInstallFinish
  ; Create shortcuts in user's start menu
  CreateDirectory "$SMPROGRAMS\OpenVoiceProxy"
  CreateShortCut "$SMPROGRAMS\OpenVoiceProxy\OpenVoiceProxy.lnk" "$INSTDIR\OpenVoiceProxy.exe" "" "$INSTDIR\OpenVoiceProxy.exe" 0
  CreateShortCut "$SMPROGRAMS\OpenVoiceProxy\Admin Interface.lnk" "http://localhost:3000/admin/" "" "$INSTDIR\OpenVoiceProxy.exe" 0
  CreateShortCut "$SMPROGRAMS\OpenVoiceProxy\Uninstall.lnk" "$INSTDIR\Uninstall.exe"
  ; Ensure user data directory exists and create default empty data files
  CreateDirectory "$APPDATA\OpenVoiceProxy\data"
  ; Create empty JSON files if they don't exist
  IfFileExists "$APPDATA\OpenVoiceProxy\data\system-credentials.json" 0 +2
  Goto +3
  ; Write empty JSON object
  FileOpen $0 "$APPDATA\OpenVoiceProxy\data\system-credentials.json" w
  FileWrite $0 "{}"
  FileClose $0
  IfFileExists "$APPDATA\OpenVoiceProxy\data\api-keys.json" 0 +2
  Goto +3
  FileOpen $0 "$APPDATA\OpenVoiceProxy\data\api-keys.json" w
  FileWrite $0 "[]"
  FileClose $0
  IfFileExists "$APPDATA\OpenVoiceProxy\data\usage-logs.json" 0 +2
  Goto +3
  FileOpen $0 "$APPDATA\OpenVoiceProxy\data\usage-logs.json" w
  FileWrite $0 "[]"
  FileClose $0
!macroend

; Uninstall initialization
!macro customUnInit
  SetShellVarContext current
!macroend

; During uninstall
!macro customUnInstall
  ; Remove from startup
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "OpenVoiceProxy"

  ; Remove start menu folder
  RMDir /r "$SMPROGRAMS\OpenVoiceProxy"

  ; Remove desktop shortcut if it exists
  Delete "$DESKTOP\OpenVoiceProxy.lnk"
!macroend
