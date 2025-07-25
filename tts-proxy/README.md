# OpenVoiceProxy

A secure, cloud-ready proxy server that intercepts ElevenLabs API calls and redirects them to various TTS engines. Designed for production deployment on DigitalOcean App Platform with comprehensive security, monitoring, and key management features.

## Quick Start

1. **Install dependencies:**
   ```bash
   cd tts-proxy
   npm install
   ```

2. **Start the proxy:**
   ```bash
   npm start
   ```

3. **Test the proxy:**
   ```bash
   npm test
   ```

## What it does

- **Intercepts ElevenLabs API calls** from Grid3
- **Provides compatible API endpoints:**
  - `GET /v1/voices` - Returns available local voices
  - `POST /v1/text-to-speech/{voiceId}/stream/with-timestamps` - Generates speech
  - `GET /v1/user` - Returns user/subscription info
- **System tray integration** for easy management
- **Configuration UI** for voice mapping and settings

## Current Status

✅ **Basic proxy server** - Working
✅ **ElevenLabs API endpoints** - Full implementation
✅ **System tray integration** - Working
✅ **Configuration UI** - Basic version
✅ **js-tts-wrapper integration** - Working (eSpeak, Azure, ElevenLabs)
✅ **Host file modification** - Utility ready
✅ **Real audio generation** - Working
✅ **Voice discovery & mapping** - Automated
✅ **Grid3 simulation** - Complete testing suite
✅ **Configuration management** - JSON-based config

## Testing

### 1. Start the Proxy Server
```bash
# Double-click or run:
start-proxy.bat
```

### 2. Test the Endpoints
```bash
# In another terminal, double-click or run:
test-proxy.bat
```

### 3. Configure Voices
```bash
# Auto-discover and configure voices:
configure-voices.bat
```

### 4. Simulate Grid3 Workflow
```bash
# Test complete Grid3 integration:
simulate-grid3.bat
```

### 5. Manual Testing
- Health: http://localhost:3000/health
- Voices: http://localhost:3000/v1/voices
- User: http://localhost:3000/v1/user

## Host File Redirection

### Setup (Requires Administrator)
```bash
# Right-click Command Prompt -> "Run as Administrator"
# Then double-click or run:
setup-hosts.bat
```

### Manual Commands
```bash
# Check status
node manage-hosts.js status

# Add redirect (as admin)
node manage-hosts.js add

# Remove redirect (as admin)
node manage-hosts.js remove

# Restore from backup (as admin)
node manage-hosts.js restore
```

## Testing with Grid3

1. **Start the proxy**: `start-proxy.bat`
2. **Add host redirect**: Run `setup-hosts.bat` as Administrator
3. **Launch Grid3**: ElevenLabs API calls will now go to your proxy
4. **Test TTS**: Try using ElevenLabs voices in Grid3
5. **Check logs**: Monitor the proxy console for requests

## Advanced Features

### Voice Configuration
- **Auto-discovery**: Automatically finds available TTS voices
- **Smart mapping**: Creates intelligent ElevenLabs → Local voice mappings
- **Multi-engine support**: eSpeak, Azure, ElevenLabs, Google, AWS Polly, OpenAI
- **Configuration management**: JSON-based settings with backup/restore

### Testing & Simulation
- **Grid3 simulation**: Complete workflow testing that mimics Grid3's API usage
- **Performance testing**: Latency and throughput measurement
- **Audio generation**: Real audio files for testing
- **Error handling**: Comprehensive error scenario testing

### Environment Configuration
Create a `.env` file (copy from `.env.example`) to add API keys:
```bash
# Optional: Add your API keys for more TTS engines
AZURE_SPEECH_KEY=your_key_here
AZURE_SPEECH_REGION=westeurope
ELEVENLABS_API_KEY=your_key_here
```

## Next Steps

1. ✅ Basic proxy server working
2. ✅ Real TTS integration (eSpeak, Azure, ElevenLabs)
3. ✅ Host file modification utility
4. ✅ Voice discovery and configuration
5. ✅ Grid3 simulation testing
6. 🔄 Test with actual Grid3
7. ⏳ Add SherpaOnnx for offline TTS
8. ⏳ Enhanced configuration UI
9. ⏳ Performance optimization

## Architecture

```
Grid3 Application
       ↓
   (HTTP Requests to api.elevenlabs.io)
       ↓
   Host File Redirect
       ↓
   TTS Proxy Server (localhost:3000)
       ↓
   js-tts-wrapper
       ↓
   Local TTS Engines
```

## Configuration

The proxy can be configured through:
- System tray menu
- Configuration UI (accessible from tray)
- Configuration file (planned)

## Development

- **Framework:** Electron + Express.js
- **TTS Integration:** js-tts-wrapper
- **Logging:** Winston
- **UI:** HTML/CSS/JavaScript
