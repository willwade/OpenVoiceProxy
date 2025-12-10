# OpenVoiceProxy

A secure, cloud-ready proxy server that intercepts ElevenLabs API calls and redirects them to various TTS engines. Perfect for applications that need to use local or alternative TTS services while maintaining compatibility with ElevenLabs API.

## 🚀 Features

- **🔒 Secure API Key Management** - Complete authentication system with admin interface
- **🎤 Multiple TTS Engines** - Support for Azure, ElevenLabs, OpenAI, AWS Polly, Google Cloud TTS, and eSpeak
- **🌐 ElevenLabs API Compatible** - Drop-in replacement for ElevenLabs API endpoints
- **📊 Monitoring & Analytics** - Built-in usage tracking and performance metrics
- **🛡️ Production Ready** - Comprehensive security, logging, and error handling
- **☁️ Cloud Deployable** - Optimized for DigitalOcean App Platform deployment

## 📁 Project Layout
- `tts-proxy/` — core HTTP/WebSocket server and admin UI
- `electron-server/` — Windows-only Electron shell + NSIS packaging that wraps the server and ships the CallTTS CLI

## 📋 Quick Start (Local Development)

### Prerequisites

- [Node.js](https://nodejs.org/) (v22 recommended; repo has `.nvmrc`)
- [Git](https://git-scm.com/)
- At least one TTS service API key (optional for basic testing)

### 1. Clone and Install

```bash
git clone https://github.com/willwade/OpenVoiceProxy.git
cd OpenVoiceProxy/tts-proxy
npm install
```

### 2. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp ../.env.example .env.local
```

Edit `.env.local` with your configuration:

```bash
# Required for admin access
ADMIN_API_KEY=your_secure_admin_key_here

# Optional TTS service keys (configure at least one for full functionality)
AZURE_SPEECH_KEY=your_azure_key
AZURE_SPEECH_REGION=westeurope
ELEVENLABS_API_KEY=your_elevenlabs_key
OPENAI_API_KEY=your_openai_key
```

### 3. Create Initial Admin Key

```bash
export ADMIN_API_KEY="your_secure_admin_key_here"
node scripts/create-admin-key.js
```

Save the generated API key - you'll need it to access the admin interface.

### 4. Start the Server

For development:
```bash
npm run start:server
```

For production mode:
```bash
npm run start:production
```

### 5. Test the Installation

Open your browser and visit:
- **Health Check**: http://localhost:3000/health
- **Admin Interface**: http://localhost:3000/admin
- **API Documentation**: See endpoints below

## 🖥️ Windows Desktop Build (Electron)
Electron packaging now lives in `electron-server/` and wraps the same backend for offline/local use.

```bash
cd electron-server
npm install
npm run build:all   # builds server assets, CallTTS.exe (SEA), then the Windows installer (NSIS)
```

Artifacts land in `electron-server/dist/`. Build scripts are intended to be run on Windows.

## 🔧 API Endpoints

### Public Endpoints
- `GET /health` - Health check with system information
- `GET /ready` - Readiness check for load balancers
- `GET /metrics` - Application metrics and statistics

### Protected Endpoints (Require API Key)
- `GET /v1/voices` - List available voices (ElevenLabs compatible)
- `POST /v1/text-to-speech/{voiceId}` - Generate speech
- `POST /v1/text-to-speech/{voiceId}/stream/with-timestamps` - Generate speech with timestamps
- `GET /v1/user` - User information (ElevenLabs compatible)

### Admin Endpoints (Require Admin API Key)
- `GET /admin` - Web-based admin interface
- `GET /admin/api/keys` - List API keys
- `POST /admin/api/keys` - Create new API key
- `PUT /admin/api/keys/{keyId}` - Update API key
- `DELETE /admin/api/keys/{keyId}` - Delete API key
- `GET /admin/api/usage` - Usage statistics

## 🔑 API Key Usage

### Authentication
Include your API key in requests using one of these methods:

**Header (Recommended):**
```bash
curl -H "X-API-Key: your_api_key_here" http://localhost:3000/v1/voices
```

**Authorization Header:**
```bash
curl -H "Authorization: Bearer your_api_key_here" http://localhost:3000/v1/voices
```

### Creating API Keys
1. Access the admin interface at http://localhost:3000/admin
2. Login with your admin API key
3. Create new keys for your applications
4. Configure permissions and rate limits as needed

## 🎤 TTS Engine Configuration

### Supported Engines

| Engine | Configuration Required | Quality | Languages |
|--------|----------------------|---------|-----------|
| **eSpeak** | None (built-in) | Basic | 30+ languages |
| **Azure Speech** | API Key + Region | High | 100+ languages |
| **ElevenLabs** | API Key | Premium | English + others |
| **OpenAI** | API Key | High | Multiple |
| **AWS Polly** | AWS Credentials | High | 25+ languages |
| **Google Cloud TTS** | Service Account JSON | High | 40+ languages |

### Voice Mapping
OpenVoiceProxy automatically maps local voices to ElevenLabs-compatible voice IDs. You can customize these mappings in the configuration or through environment variables.

## 🧪 Testing

### Basic API Test
```bash
# Test health endpoint
curl http://localhost:3000/health

# Test voices endpoint (requires API key)
curl -H "X-API-Key: your_api_key" http://localhost:3000/v1/voices

# Test TTS generation
curl -X POST \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "voice_settings": {"stability": 0.5}}' \
  http://localhost:3000/v1/text-to-speech/espeak-en \
  --output test-audio.wav
```

### Run Test Suite
```bash
npm test
```

## 🔒 Security Features

- **API Key Authentication** - All endpoints protected with API keys
- **Rate Limiting** - Configurable rate limits per API key
- **Request Validation** - Input sanitization and validation
- **Security Headers** - CORS, XSS protection, CSP, and more
- **IP Filtering** - Optional IP allowlist/blocklist
- **Audit Logging** - Comprehensive request and error logging

## 📊 Monitoring

### Built-in Monitoring
- **Health Checks** - `/health` and `/ready` endpoints
- **Metrics** - Request counts, error rates, response times
- **Usage Analytics** - Per-key usage tracking
- **Performance Monitoring** - Memory usage, uptime statistics

### Log Levels
Configure logging with the `LOG_LEVEL` environment variable:
- `debug` - Detailed debugging information
- `info` - General information (default)
- `warn` - Warning messages
- `error` - Error messages only

## 🚀 Production Deployment

For production deployment on DigitalOcean App Platform, see our comprehensive deployment guide:

**📖 [DigitalOcean Deployment Guide](DEPLOYMENT.md)**

The deployment guide covers:
- DigitalOcean App Platform setup
- Environment variable configuration
- Database setup and management
- SSL/TLS configuration
- Scaling and performance optimization
- Monitoring and maintenance

### Quick Deploy to DigitalOcean

1. **Prepare environment variables** (see [DEPLOYMENT.md](DEPLOYMENT.md))
2. **Run deployment script:**
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```
3. **Configure your TTS service API keys** in DigitalOcean dashboard
4. **Access your deployed admin interface** to create API keys

## 🛠️ Development

### Project Structure
```
OpenVoiceProxy/
├── tts-proxy/                 # Main application
│   ├── src/                   # Source code
│   │   ├── proxy-server.js    # Main server
│   │   ├── auth-middleware.js # Authentication
│   │   ├── key-manager.js     # API key management
│   │   └── ...
│   ├── public/                # Admin interface
│   ├── scripts/               # Utility scripts
│   └── package.json
├── .do/                       # DigitalOcean configuration
├── scripts/                   # Deployment scripts
├── DEPLOYMENT.md              # Deployment guide
└── README.md                  # This file
```

### Available Scripts
- `npm start` - Start with Electron (development)
- `npm run start:server` - Start server only (development)
- `npm run start:production` - Start in production mode
- `npm test` - Run test suite
- `npm run dev` - Start in development mode

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Deployment Guide](DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/willwade/OpenVoiceProxy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/willwade/OpenVoiceProxy/discussions)

## 🙏 Acknowledgments

- Built with [js-tts-wrapper](https://github.com/willwade/js-tts-wrapper) for TTS engine integration
- Inspired by the need for flexible, secure TTS proxy solutions
- Thanks to all contributors and the open-source community

---

**Made with ❤️ for the accessibility and TTS community**
