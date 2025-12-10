# OpenVoiceProxy CLI Implementation Guide

## Overview

This guide documents the implementation of the CallTTS CLI tool for OpenVoiceProxy, designed to provide a command-line interface for AAC (Augmentative and Alternative Communication) applications to generate speech using the OpenVoiceProxy server.

The implementation consists of:

1. **CallTTS CLI Tool** - A Node.js application that connects to the OpenVoiceProxy server via WebSocket
2. **CLI Config Generator UI** - A Vue.js web interface for generating configuration files
3. **Windows Integration** - Batch file wrapper and installer components for Windows distribution
4. **Testing Framework** - Scripts to validate the WebSocket API and CLI functionality

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────────┐
│                    OpenVoiceProxy System                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐         ┌─────────────────────────────┐  │
│  │   Electron App  │         │       Web Server            │  │
│  │   (main.js)     │         │    (proxy-server.js)       │  │
│  └─────────────────┘         └─────────────────────────────┘  │
│           │                             │                     │
│           │                             │                     │
│  ┌─────────────────┐                 ┌─┴───────────────────┐  │
│  │   Admin UI      │                 │  WebSocket Endpoint  │  │
│  │  (Vue3 + TS)    │                 │     (/api/ws)        │  │
│  └─────────────────┘                 └───────────────────────┘  │
│           │                                     │              │
│           │                                     │              │
│  ┌─────────────────┐                 ┌─────────┴─────────────┐  │
│  │ CLI Config      │                 │      CallTTS CLI     │  │
│  │ Generator UI    │◄────────────────┤    (WebSocket Client)│  │
│  │                 │                 │                       │  │
│  └─────────────────┘                 └───────────────────────┘  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│                    AAC Applications                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐                 ┌───────────────────────┐  │
│  │   Windows App   │                 │      Batch Wrapper    │  │
│  │                 │◄────────────────┤    (CallTTS.bat)      │  │
│  └─────────────────┘                 └───────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User generates a configuration file using the CLI Config Generator UI
2. AAC application calls CallTTS.exe (or CallTTS.bat) with the text and config
3. CLI tool establishes a WebSocket connection to the OpenVoiceProxy server
4. Server processes the text using the configured TTS engine
5. Audio is streamed back to the CLI tool
6. CLI tool plays the audio and/or saves it to a file

## Implementation Details

### 1. CLI Tool (cli/CallTTS.js)

The CLI tool is a Node.js application that:

- Parses command-line arguments using the `commander` library
- Loads configuration from JSON files
- Establishes a WebSocket connection to the server
- Handles streaming audio data
- Provides audio playback functionality
- Implements error handling and logging

#### Key Features

- Configuration file support with command-line overrides
- WebSocket communication with the server
- Audio playback on Windows, macOS, and Linux
- File saving capabilities
- Comprehensive logging

#### Configuration Structure

```json
{
  "server": {
    "url": "ws://localhost:3000/api/ws",
    "apiKey": "dev"
  },
  "tts": {
    "engine": "azure",
    "voice": "en-US-JennyNeural",
    "format": "wav",
    "sampleRate": 24000
  },
  "translation": {
    "enabled": false,
    "provider": "google",
    "apiKey": "",
    "targetLanguage": "en"
  },
  "output": {
    "playAudio": true,
    "saveToFile": false,
    "outputPath": "C:\\AAC\\audio\\output.wav",
    "logFile": "C:\\AAC\\logs\\calltts.log"
  }
}
```

#### WebSocket Communication

The CLI tool communicates with the server using JSON messages:

1. **Request Message**:
```json
{
  "type": "speak",
  "text": "Text to synthesize",
  "engine": "azure",
  "voice": "en-US-JennyNeural",
  "format": "wav",
  "sampleRate": 24000
}
```

2. **Response Messages**:
- `start`: Indicates beginning of audio stream
- `metadata`: Contains audio format information
- Binary audio data: Chunks of PCM/WAV data
- `end`: Marks the end of the audio stream

### 2. CLI Config Generator UI (admin-ui/src/views/CLIConfigView.vue)

The Config Generator is a Vue.js component that:

- Fetches available engines and voices from the server
- Provides an intuitive interface for creating configuration files
- Allows users to test their configuration
- Generates and downloads configuration files
- Shows example command usage

#### Key Features

- Dynamic voice selection based on engine
- Real-time configuration preview
- Test functionality with audio playback
- Download and copy-to-clipboard options
- Integration with existing API keys

### 3. Windows Integration

#### Batch Wrapper (cli/CallTTS.bat)

Provides a Windows-friendly wrapper for the CLI tool:
- Automatic path detection for CallTTS.exe
- Error checking and user-friendly error messages
- Passes all arguments to the underlying executable

#### Installer Configuration

- `electron-builder.yml`: Configuration for building Windows installer
- `scripts/installer.nsh`: Custom NSIS script for installer
- Includes CLI tool in the distribution
- Creates Start Menu shortcuts

### 4. Testing Framework

#### WebSocket Test Script (test-cli-websocket.js)

Validates the WebSocket API by:
- Establishing a connection to the server
- Sending a test request
- Receiving and saving audio data
- Testing audio playback

## Usage Examples

### Basic Usage

```bash
# Using default configuration
CallTTS.exe --text "Hello, world!"

# Using a custom configuration file
CallTTS.exe --config "C:\AAC\config.json" --text "Hello, world!"

# Save output to file
CallTTS.exe --output "C:\AAC\audio\speech.wav" --text "Hello, world!"
```

### Integration with AAC Applications

```javascript
// Example integration in a Node.js AAC application
const { spawn } = require('child_process');

function speakText(text) {
  const calltts = spawn('CallTTS.exe', [
    '--config', 'C:\\AAC\\config.json',
    '--text', text
  ]);
  
  calltts.on('error', (error) => {
    console.error(`Failed to start CallTTS: ${error.message}`);
  });
  
  calltts.on('close', (code) => {
    if (code !== 0) {
      console.error(`CallTTS exited with code ${code}`);
    }
  });
}

// Usage
speakText("Hello, I am using an AAC application");
```

## Performance Considerations

### Engine Persistence

The OpenVoiceProxy server keeps TTS engines initialized to reduce latency:

1. **First Request**: May take longer due to engine initialization
2. **Subsequent Requests**: Faster due to engine persistence
3. **Local Engines** (SherpaOnnx, eSpeak): Benefit most from persistence

#### Optimization Tips

- Use consistent engine/voice combinations
- Consider pre-warming the server after startup
- Batch multiple requests when possible

### Audio Format Considerations

- **WAV**: Uncompressed, larger file size, widely compatible
- **MP3**: Compressed, smaller file size, requires decoding
- **PCM16**: Raw audio data, smallest size, requires header for playback

## Security Considerations

### API Key Management

- API keys are stored in configuration files
- Consider using environment variables for production deployments
- Rotate keys regularly for security

### Network Security

- WebSocket connections use the same authentication as the REST API
- Consider using WSS (WebSocket Secure) for production deployments
- Validate input to prevent injection attacks

## Troubleshooting

### Common Issues

1. **Connection Timed Out**
   - Check if the OpenVoiceProxy server is running
   - Verify the server URL in your configuration
   - Ensure the API key is valid

2. **Invalid Voice Error**
   - Check that the voice ID is correct for the selected engine
   - Use the CLI Config Generator to select a valid voice
   - Verify the engine has valid credentials

3. **Audio Playback Failed**
   - Check that your system has audio capabilities
   - Try saving to a file instead with `--output` and `--no-play`
   - Ensure the temporary directory is writable

4. **Performance Issues**
   - First requests may be slow due to engine initialization
   - Subsequent requests should be faster due to engine persistence
   - Consider running a "warmup" request after server startup

### Debugging

Use the `--log-level debug` option to get detailed logging:

```bash
CallTTS.exe --config config.json --text "Debug test" --log-level debug
```

Check the log file specified in your configuration for detailed error information.

## Future Enhancements

### Planned Features

1. **Translation Integration**
   - Implement Google Translate/Azure Translator support
   - Add automatic language detection
   - Provide transliteration options

2. **SSML Support**
   - Add full SSML support for advanced speech synthesis
   - Include prosody control (pitch, rate, volume)
   - Support multiple voices in a single request

3. **Batch Processing**
   - Support processing multiple text inputs
   - Queue management for high-throughput scenarios
   - Progress reporting for long-running operations

4. **Audio Post-Processing**
   - Volume normalization
   - Background noise removal
   - Audio concatenation for multiple requests

### Implementation Suggestions

1. **Caching Layer**
   - Implement client-side caching for repeated requests
   - Cache keys based on text hash and voice settings
   - Provide cache management options

2. **Offline Mode**
   - Support local TTS engines when server is unavailable
   - Graceful fallback mechanisms
   - Sync when server becomes available again

3. **Performance Metrics**
   - Add detailed timing information
   - Track request latency and success rates
   - Implement adaptive retry logic

## Recent Enhancements (December 2025)

### Translation and Transliteration Support

The CLI tool now supports comprehensive translation and transliteration features:

#### Translation Features
- **Source Language Detection**: Auto-detect source language or specify explicitly
- **Target Language Selection**: Support for 113+ languages via Google Translate and Azure Translator
- **Provider Choice**: Choose between Google Translate and Azure Translator
- **Clipboard Integration**: Optionally overwrite clipboard with translated text

#### Transliteration (Azure Only)
- **Script Conversion**: Convert text between different writing systems
- **19 Supported Scripts**: Including Latin, Arabic, Devanagari, Cyrillic, and more
- **Use Cases**:
  - Latin to Arabic for Urdu
  - Latin to Devanagari for Hindi
  - And many more combinations

#### Configuration Example
```json
{
  "translation": {
    "enabled": true,
    "provider": "azure",
    "apiKey": "your-api-key",
    "sourceLanguage": "auto",
    "targetLanguage": "ur",
    "transliteration": {
      "enabled": true,
      "fromScript": "Latn",
      "toScript": "Arab"
    }
  }
}
```

### Clipboard/Pasteboard Integration

The CLI tool now supports reading from and writing to the system clipboard:

#### Features
- **Automatic Text Input**: Read text from clipboard if `--text` parameter not provided
- **Cross-Platform**: Works on Windows (PowerShell), macOS (pbcopy/pbpaste), and Linux (xclip/xsel)
- **Translation Output**: Optionally write translated text back to clipboard
- **AAC Integration**: Perfect for AAC apps that copy text to clipboard

#### Configuration
```json
{
  "input": {
    "useClipboard": true,
    "overwriteClipboardOnCompletion": false
  }
}
```

#### Usage Examples
```bash
# Copy text to clipboard, then run:
CallTTS.exe --config config.json

# Or provide text explicitly:
CallTTS.exe --config config.json --text "Hello world"
```

### CLI Config Generator Enhancements

The web-based CLI Config Generator now includes:

1. **Language Selection**
   - Source language dropdown with auto-detect option
   - Target language dropdown with 113+ languages
   - Searchable language lists

2. **Transliteration UI** (Azure only)
   - Enable/disable transliteration
   - From/To script selection
   - 19 supported scripts

3. **Input Settings**
   - Checkbox to enable clipboard reading
   - Checkbox to overwrite clipboard on completion
   - Helpful tooltips and descriptions

4. **Environment Control**
   - `VITE_ENABLE_CLI_CONFIG` environment variable
   - Hide CLI Config Generator in production deployments
   - Useful for public-facing instances

### Language Support

#### Translation Languages (113+)
Afrikaans, Albanian, Amharic, Arabic, Armenian, Azerbaijani, Basque, Belarusian, Bengali, Bosnian, Bulgarian, Catalan, Cebuano, Chinese (Simplified), Chinese (Traditional), Corsican, Croatian, Czech, Danish, Dutch, English, Esperanto, Estonian, Finnish, French, Galician, Georgian, German, Greek, Gujarati, Haitian Creole, Hausa, Hawaiian, Hebrew, Hindi, Hmong, Hungarian, Icelandic, Igbo, Indonesian, Irish, Italian, Japanese, Javanese, Kannada, Kazakh, Khmer, Kinyarwanda, Korean, Kurdish, Kyrgyz, Lao, Latin, Latvian, Lithuanian, Luxembourgish, Macedonian, Malagasy, Malay, Malayalam, Maltese, Maori, Marathi, Mongolian, Myanmar (Burmese), Nepali, Norwegian, Nyanja (Chichewa), Odia (Oriya), Pashto, Persian, Polish, Portuguese, Punjabi, Romanian, Russian, Samoan, Scots Gaelic, Serbian, Sesotho, Shona, Sindhi, Sinhala (Sinhalese), Slovak, Slovenian, Somali, Spanish, Sundanese, Swahili, Swedish, Tagalog (Filipino), Tajik, Tamil, Tatar, Telugu, Thai, Turkish, Turkmen, Ukrainian, Urdu, Uyghur, Uzbek, Vietnamese, Welsh, Xhosa, Yiddish, Yoruba, Zulu

#### Transliteration Scripts (19)
Latin, Arabic, Bengali, Cyrillic, Devanagari, Georgian, Greek, Gujarati, Gurmukhi, Hangul, Hebrew, Japanese, Kannada, Malayalam, Oriya, Tamil, Telugu, Thai, Chinese (Simplified)

## Conclusion

The OpenVoiceProxy CLI implementation provides a robust, user-friendly way for AAC applications to access TTS capabilities. The WebSocket-based architecture ensures low latency, while the configuration system allows for flexibility without sacrificing ease of use.

The recent enhancements add powerful translation, transliteration, and clipboard integration features, making the tool even more versatile for multilingual AAC applications and international users.

The modular design allows for easy extension and customization, while the comprehensive testing framework ensures reliability across different platforms and use cases.

For more information, refer to the individual component documentation:
- CallTTS CLI Tool: `cli/README.md`
- CLI Config Generator: `admin-ui/src/views/CLIConfigView.vue`
- WebSocket API: `src/esp32-endpoint.js`
- Language Constants: `admin-ui/src/constants/languages.ts`
