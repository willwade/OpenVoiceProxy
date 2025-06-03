# TTS Proxy Implementation Plan

## Overview
Create an Electron-based application that acts as a proxy server between Grid3 and custom TTS engines. The application will intercept requests intended for the ElevenLabs API and redirect them to local TTS engines using our existing JS-TTS-wrapper.

Info on this is wrapper is at https://github.com/willwade/js-tts-wrapper

Im the author please let me know if we need to fix any bugs or add features to it.

## IMPLEMENTATION STATUS
✅ **Phase 1 Started**: Creating basic proxy structure


## Components

### 1. Core Proxy Server
- Express server that mimics ElevenLabs API endpoints
- Handles authentication and request validation
- Routes TTS requests to our JS-TTS-wrapper
- Returns audio in the format expected by Grid3

### 2. Configuration UI
- Settings panel for TTS configuration
- Voice mapping editor (ElevenLabs voice IDs → local voices)
- Network settings (port, hostname)
- Audio output settings (format, quality, etc.)
- Startup preferences

### 3. System Integration
- System tray icon with status indicator
- Auto-start capability
- Host file modification utility
- Logging and diagnostics

## Implementation Steps

### Phase 1: Core Functionality (Week 1)
1. Set up basic Electron project structure
2. Implement Express server with mock ElevenLabs endpoints:
   - `/v1/voices` - Return available voices
   - `/v1/text-to-speech/{voiceId}/stream/with-timestamps` - Generate speech
3. Integrate JS-TTS-wrapper for speech synthesis
4. Add basic logging system
5. Create system tray icon and menu

### Phase 2: Configuration UI (Week 2)
1. Design configuration UI wireframes
2. Implement settings window with the following tabs:
   - General Settings (startup, logging level)
   - Voice Mapping (map ElevenLabs voices to local voices)
   - Network Settings (port, hostname)
   - Audio Settings (format, quality)
3. Create configuration storage system using Electron's userData
4. Implement configuration validation

### Phase 3: System Integration (Week 3)
1. Create host file modification utility to redirect api.elevenlabs.io
2. Implement auto-start functionality
3. Add detailed logging and diagnostics panel
4. Create installation package with necessary permissions

### Phase 4: Testing and Refinement (Week 4)
1. Test with Grid3 application
2. Optimize performance and reduce latency
3. Add error handling and recovery mechanisms
4. Create user documentation

## Technical Specifications

### Proxy Server
- Express.js for HTTP server
- Port 3000 by default (configurable)
- Endpoints:
  - GET `/v1/voices` - Returns available voices
  - POST `/v1/text-to-speech/{voiceId}/stream/with-timestamps` - Generates speech

### Configuration Storage
- JSON file stored in Electron's userData directory
- Schema:
  ```json
  {
    "general": {
      "autoStart": true,
      "minimizeToTray": true,
      "logLevel": "info"
    },
    "network": {
      "port": 3000,
      "modifyHostFile": true
    },
    "voiceMapping": [
      {
        "elevenLabsId": "voice1",
        "elevenLabsName": "Custom Voice 1",
        "localVoiceId": "Microsoft David",
        "parameters": {
          "rate": 1.0,
          "pitch": 1.0
        }
      }
    ],
    "audio": {
      "format": "mp3",
      "quality": "medium",
      "cacheEnabled": true,
      "cachePath": "./cache"
    }
  }
  ```

### Configuration UI
- Electron BrowserWindow with HTML/CSS/JS
- Tabs-based interface
- Voice mapping editor with preview capability
- Network configuration with validation
- Host file modification with admin privileges request

## Required Dependencies
- electron: Core framework
- express: HTTP server
- winston: Logging
- electron-store: Configuration storage
- auto-launch: System startup integration
- sudo-prompt: For host file modifications (requires admin)
- js-tts-wrapper: Our existing TTS integration library

## Deployment
- Windows installer with NSIS
- macOS DMG package
- Linux AppImage
- Auto-update capability using electron-updater

## Challenges and Considerations
1. **Host File Modification**: Requires admin privileges
2. **Audio Format Compatibility**: Ensure output matches what Grid3 expects
3. **Performance**: Minimize latency for real-time speech
4. **Error Handling**: Graceful recovery from TTS engine failures
5. **Security**: Validate API requests properly

## Future Enhancements
1. Support for additional TTS engines
2. Voice customization and fine-tuning
3. Text preprocessing options
4. Audio effects and post-processing
5. Usage analytics and reporting