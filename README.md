# OpenVoiceProxy

OpenVoiceProxy is a TTS proxy and admin UI that mirrors ElevenLabs-style APIs while routing to local or alternative engines (Azure, OpenAI, AWS Polly, Google TTS, eSpeak, ElevenLabs).

## Project Layout
- `tts-proxy/` — core HTTP/WebSocket server and admin UI ([README](tts-proxy/README.md))
- `electron-server/` — Windows desktop wrapper and installer, ships the CallTTS CLI ([CLI README](electron-server/cli/README.md))
- `DEPLOYMENT.md` — DigitalOcean App Platform guide
- `tts-proxy/openapi.json` — OpenAPI description of the HTTP API

## Quick Start

### Web server (tts-proxy)
- Prereqs: Node 22+, Git, at least one TTS API key.
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
  node scripts/create-admin-key.js
  ```
- Run:
  ```bash
  npm run start:server        # dev
  npm run start:production    # prod-style
  ```
- Check: http://localhost:3000/health, admin at http://localhost:3000/admin.

### Desktop app (Windows)
- From `electron-server/` on Windows:
  ```bash
  npm install
  npm run build:all   # builds server assets, SEA CallTTS.exe, then NSIS installer
  ```
- Installer and unpacked app land in `electron-server/dist/`.

### CallTTS CLI
- Included in the Windows installer; standalone build:
  ```bash
  cd electron-server
  npm run build:cli   # outputs dist/CallTTS.exe
  ```
- Usage and config examples: see `electron-server/cli/README.md`.

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
- Monorepo scripts:
  - `tts-proxy`: `npm run start:server`, `npm run start:production`, `npm run build`, `npm test`.
  - `electron-server`: `npm run build:cli`, `npm run build` (NSIS), `npm run build:all`.
- Admin UI assets build to `tts-proxy/public/admin/` via `npm run build` inside `tts-proxy`.

## License

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
