# CallTTS CLI Tool

A command-line interface for the OpenVoiceProxy TTS server, designed for use with AAC (Augmentative and Alternative Communication) applications.

## Building (Windows, Node SEA)

Run from `electron-server/` on a Windows machine with Node 20+ (SEA is most stable on Node 22+):

```bash
npm run build:cli
```

This uses Node's SEA flow to create `dist/CallTTS.exe` (and keeps `CallTTS.bat` alongside for convenience). The exe is also pulled into the Electron installer via `npm run build:all`.

## Installation

1. Download the CallTTS.exe from the latest OpenVoiceProxy release
2. Place it in your desired location (e.g., `C:\AAC\`)
3. Create a configuration file using the [CLI Config Generator](../admin-ui/src/views/CLIConfigView.vue) in the OpenVoiceProxy admin interface

### Using the Batch Wrapper (Windows)

For easier integration with Windows applications, use the provided `CallTTS.bat` wrapper:

```batch
# Using the batch file
CallTTS.bat --text "Hello, world!"

# Using the batch file with custom config
CallTTS.bat --config "C:\AAC\config.json" --text "Hello, world!"
```

The batch file automatically detects the location of CallTTS.exe and provides better error messages.

## Quick Start

```bash
# Using default configuration
CallTTS.exe --text "Hello, world!"

# Using a custom configuration file
CallTTS.exe --config "C:\AAC\config.json" --text "Hello, world!"

# Save output to file
CallTTS.exe --output "C:\AAC\audio\speech.wav" --text "Hello, world!"
```

## Configuration

Create a configuration file to specify TTS engine, voice, and other settings. You can generate this configuration using the CLI Config Generator in the OpenVoiceProxy admin interface.

Example configuration file:

```json
{
  "server": {
    "url": "ws://localhost:3000/ws",
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
    "sourceLanguage": "auto",
    "targetLanguage": "en",
    "transliteration": {
      "enabled": false,
      "fromScript": "Latn",
      "toScript": "Arab"
    }
  },
  "input": {
    "useClipboard": true,
    "overwriteClipboardOnCompletion": false
  },
  "output": {
    "playAudio": true,
    "saveToFile": false,
    "outputPath": "C:\\AAC\\audio\\output.wav",
    "logFile": "C:\\AAC\\logs\\calltts.log"
  }
}
```

### Configuration Fields

#### Server
- `url` - WebSocket server URL
- `apiKey` - API key for authentication

#### TTS
- `engine` - TTS engine (azure, google, openai, elevenlabs, polly, espeak, etc.)
- `voice` - Voice ID specific to the engine
- `format` - Audio format (wav, mp3, pcm16)
- `sampleRate` - Sample rate in Hz (e.g., 24000, 16000)

#### Translation (Optional)
- `enabled` - Enable translation before TTS
- `provider` - Translation provider (google, azure)
- `apiKey` - Translation API key
- `sourceLanguage` - Source language code (use "auto" for auto-detection)
- `targetLanguage` - Target language code (e.g., "en", "es", "fr")
- `transliteration` - Azure-only transliteration settings
  - `enabled` - Enable transliteration (e.g., Latin to Arabic for Urdu)
  - `fromScript` - Source script (e.g., "Latn", "Arab", "Deva")
  - `toScript` - Target script

#### Input
- `useClipboard` - Read text from clipboard if --text not provided
- `overwriteClipboardOnCompletion` - Replace clipboard with translated text after completion

#### Output
- `playAudio` - Play audio after generation
- `saveToFile` - Save audio to file
- `outputPath` - File path for saved audio
- `logFile` - Path to log file

## Command Line Options

### Text Input
- `-t, --text <text>` - Text to convert to speech
  - **Optional** if `input.useClipboard` is enabled in config
  - If not provided and clipboard is enabled, text will be read from clipboard/pasteboard

### Optional Options
- `-c, --config <path>` - Path to configuration file (default: config.json)
- `-o, --output <path>` - Output file path for audio (overrides config)
- `--server <url>` - WebSocket server URL (overrides config)
- `--api-key <key>` - API key for authentication (overrides config)
- `--engine <name>` - TTS engine to use (overrides config)
- `--voice <id>` - Voice ID to use (overrides config)
- `--format <type>` - Audio format (wav, mp3, pcm16) (overrides config)
- `--sample-rate <rate>` - Sample rate in Hz (overrides config)
- `--no-play` - Do not play audio after generation (overrides config)
- `--log-level <level>` - Logging level (error, warn, info, debug) (default: info)
- `-h, --help` - Display help for command

## Examples

### Basic Usage
```bash
CallTTS.exe --text "This is a test"
```

### Custom Voice
```bash
CallTTS.exe --text "This is a test" --voice en-GB-RyanNeural --engine azure
```

### Save to File
```bash
CallTTS.exe --text "This is a test" --output "C:\temp\speech.wav" --no-play
```

### Using Configuration File
```bash
# Create a config file with the CLI Config Generator first
CallTTS.exe --config "C:\AAC\my-config.json" --text "This is a test"
```

### Using Clipboard (No --text parameter)
```bash
# Copy text to clipboard first, then run:
CallTTS.exe --config config.json

# The tool will read from clipboard and speak it
# Useful for AAC applications that copy text to clipboard
```

### Translation Example
```bash
# Translate Spanish to English and speak
CallTTS.exe --text "Hola mundo" --config config-with-translation.json

# With transliteration (Latin to Arabic for Urdu)
# Configure transliteration in config.json, then:
CallTTS.exe --text "Hello world" --config urdu-config.json
```

## Integration with AAC Applications

The CallTTS tool is designed to be called from AAC applications. Here's how to integrate:

1. Place CallTTS.exe in a known location
2. Create a configuration file using the CLI Config Generator
3. Call CallTTS.exe with the text to speak

### Example Integration (Pseudocode)

```javascript
// In your AAC application
function speakText(text) {
  const { spawn } = require('child_process');
  
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

// Call the function
speakText("Hello, I am using an AAC application");
```

### Integration with Windows Applications (Batch File)

For Windows applications, you can use the provided batch file wrapper:

```javascript
// In your Windows application
function speakText(text) {
  const { spawn } = require('child_process');
  
  const calltts = spawn('CallTTS.bat', [
    '--config', 'C:\\AAC\\config.json',
    '--text', text
  ]);
  
  // Same error handling as above
}
```

## Supported TTS Engines

CallTTS supports all engines configured in your OpenVoiceProxy instance:

- Azure Speech
- ElevenLabs
- OpenAI TTS
- Google Cloud TTS
- AWS Polly
- eSpeak
- SherpaOnnx

The available voices depend on which engines are configured and have valid credentials.

## Engine Persistence and Performance

The OpenVoiceProxy server keeps TTS engines initialized to reduce latency:

- First request to an engine may take longer (initialization)
- Subsequent requests to the same engine are faster
- SherpaOnnx and other local engines benefit most from this persistence

For optimal performance:
- Use consistent engine/voice combinations when possible
- Consider pre-warming the server after startup with a test request

## Error Handling

CallTTS provides detailed error messages and logging:

- Connection errors to the WebSocket server
- Authentication errors with API keys
- TTS generation errors
- Audio playback errors

Check the log file specified in your configuration for detailed error information.

## Troubleshooting

### "Connection timed out"
- Check that the OpenVoiceProxy server is running
- Verify the server URL in your configuration
- Ensure the API key is valid

### "Server error: Invalid voice"
- Check that the voice ID is correct for the selected engine
- Use the CLI Config Generator to select a valid voice

### "Failed to play audio"
- Check that your system has audio capabilities
- Try saving to a file instead with `--output` and `--no-play`
- Ensure the temporary directory is writable

### Performance Issues
- If first requests are slow, the engine is initializing
- Subsequent requests should be faster due to engine persistence
- Consider running a "warmup" request after server startup

## Testing

You can test the WebSocket API directly using the provided test script:

```bash
# From the tts-proxy directory
npx tsx scripts/test-cli-websocket.ts
```

This script simulates what the CLI tool does and can help diagnose connection issues.

## Privacy and Data

- All text sent to CallTTS is processed by your local OpenVoiceProxy server
- No data is sent to third-party servers unless configured in your TTS engine
- Log files may contain the text being processed

## License

CallTTS is part of the OpenVoiceProxy project and is released under the same license.
