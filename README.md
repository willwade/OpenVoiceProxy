# OpenVoiceProxy

OpenVoiceProxy is a TTS proxy and admin UI that mirrors ElevenLabs-style APIs while routing to local or alternative engines (Azure, OpenAI, AWS Polly, Google TTS, eSpeak, ElevenLabs). It also has a websocket route originally for embedded devices but also a faster solution for desktop. 

So two modes this code works in

1. Server API. Just a regular server API to get TTS over http using endpoints. See [OpenAPI.json](https://github.com/willwade/OpenVoiceProxy/blob/main/tts-proxy/openapi.json) 
2. Windows Elecron App with installer, task bar app and a CLI. 

So how does 2 actually work?

1. In an AAC app its possible to "Copy" the message bar and "Run" an executable. As long as a user can do that we ask the user to edit their pages to add these commands and call the CLI.exe which in turns calls the web server running. TTS engines are kept in memory reducing cold starts (particularly important for SherpaOnnx) and we *should* be able to do caching. (TO-DO)
2. If an app supports elevenlabs the app just changes its endpoint to localhost:3000 rather than api.elevenlabs.com and our server gives back voices and TTS data in that format. NB: Its not possible right now to do this without hacking.. 

## What we need to do:

1. The desktop app needs thinking hard over. Its not easy to get your head around due to configs and API keys. We've done a bunch of work to make it "easier" but it needs to be sinple. Install. Configure. Configure AAC app. Done. The first configure tts is still a messy UI pain..



## Project Layout
- `tts-proxy/` - core HTTP/WebSocket server and admin UI ([README](tts-proxy/README.md))
- `electron-server/` - Windows desktop wrapper and installer, ships the CallTTS CLI (.NET)
- `DEPLOYMENT.md` - DigitalOcean App Platform guide
- `tts-proxy/openapi.json` - OpenAPI description of the HTTP API

## Quick Start

### Web server (tts-proxy)
- Prereqs: Node 22+, Git, at least one TTS API key (or use free espeak engine).
- Install:
  ```bash
  git clone https://github.com/willwade/OpenVoiceProxy.git
  cd OpenVoiceProxy/tts-proxy
  npm install
  ```
- Configure:
  ```bash
  cp ../.env.example .env.local
  # edit .env.local (set ADMIN_API_KEY and any engine keys)
  ```
- Create an initial admin key:
  ```bash
  export ADMIN_API_KEY="your_secure_admin_key_here"
  npx tsx scripts/create-admin-key.ts
  ```
or if tsx is not installed globally:
  ```bash
  npm exec -w tts-proxy -- tsx scripts/create-admin-key.ts
  ```

- Run:
  ```bash
  npm run start:ts            # TypeScript dev server
  npm run dev:ts              # TypeScript with hot reload
  npm run start:production    # production
  ```
- Check: http://localhost:3000/health, admin at http://localhost:3000/admin, WebSocket at ws://localhost:3000/ws.

### Desktop app (Windows)
- From the repo root on Windows (requires .NET 8 SDK for the CLI):
  ```bash
  npm install
  npm run -w electron-server build:all   # builds server assets, CallTTS.exe via .NET, then NSIS installer
  ```
- Installer and unpacked app land in `electron-server/dist/`.

### CallTTS CLI
- Included in the Windows installer; standalone build:
  ```bash
  npm run -w electron-server build:cli   # outputs electron-server/dist/CallTTS.exe
  ```
- The .NET project lives at `electron-server/cli-dotnet/CallTTS`.

## API and Admin
- HTTP + WebSocket endpoints documented in `tts-proxy/openapi.json`.
- Core endpoints:
  - `GET /health`, `GET /ready`, `GET /metrics`
  - `GET /v1/voices`
  - `POST /v1/text-to-speech/{voiceId}` (plus streamed variants)
  - `GET /v1/user`
- Admin endpoints and UI live under `/admin` (API keys required).

## Deployment
- DigitalOcean App Platform instructions: [DEPLOYMENT.md](DEPLOYMENT.md).
- Minimal manual deploy: set env vars (ADMIN_API_KEY, engine keys), then `npm run start:production` in `tts-proxy/`.

## Development Notes
- Node 22+ (`.nvmrc` provided).
- CallTTS CLI builds with .NET 8 (`electron-server/cli-dotnet/CallTTS`).
- Server built with TypeScript and Hono framework.
- Workspace install from repo root: `npm install`.
- Workspace scripts:
  - `tts-proxy`: `npm run -w tts-proxy start:ts`, `npm run -w tts-proxy dev:ts`, `npm run -w tts-proxy start:production`.
  - `electron-server`: `npm run -w electron-server dev`, `npm run -w electron-server build:cli`, `npm run -w electron-server build:all`.
- Admin UI assets build to `tts-proxy/public/admin/` via `npm run build` inside `tts-proxy`.
- TypeScript source in `tts-proxy/src/` with domain/application/infrastructure layers.

## Local Desktop vs Server Mode (Dev)

### Local desktop app (Electron)
- Run:
  ```bash
  npm run -w electron-server dev
  ```
- The app runs in `LOCAL_MODE=true` and does not require a login.
- A **Local Admin Key** is auto-created and shown in the Admin UI:
  `http://localhost:3000/admin/cli-config` (copy it for AAC client configs).

### Server mode (no Electron)
- Run:
  ```bash
  npm run -w tts-proxy start:ts
  ```
- Admin UI at `http://localhost:3000/admin`.
- For a fixed admin key in dev, set `ADMIN_API_KEY` in `.env` or run:
  ```bash
  npm exec -w tts-proxy -- tsx scripts/create-admin-key.ts
  ```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Deployment Guide](DEPLOYMENT.md)
- **Issues**: [GitHub Issues](https://github.com/willwade/OpenVoiceProxy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/willwade/OpenVoiceProxy/discussions)

## 🙏 Acknowledgments

- Built with [js-tts-wrapper](https://github.com/willwade/js-tts-wrapper) for cloud TTS engine integration
- Native espeak-ng support for offline TTS (no API keys required)
- Inspired by the need for flexible, secure TTS proxy solutions
- Thanks to all contributors and the open-source community

