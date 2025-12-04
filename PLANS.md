# OpenVoiceProxy - Future Plans

> **Project Philosophy**: Lightweight TTS proxy that works on Windows/Linux servers, Electron apps, and production sites. Keep it simple, keep it compatible.

## Current State

### What We Have
- ✅ **ESP32-suitable endpoint** - Simple, minimal overhead
- ✅ **ElevenLabs API emulation** - Drop-in replacement
- ✅ **Multi-engine support** - Azure, ElevenLabs, OpenAI, Polly, Google, Watson, PlayHT, Wit.ai, eSpeak, SherpaOnnx, Piper
- ✅ **Admin UI** - Vue 3 + Vite + Tailwind
- ✅ **API key management** - Per-key engine configuration
- ✅ **Settings page** - Manage credentials via UI

---

## Planned Features

### 🎯 Priority 1: Usage Dashboard

**Goal**: Give admins visibility into API usage without external analytics.

- [ ] Track requests per API key
- [ ] Track requests per engine
- [ ] Character/word count per request
- [ ] Daily/weekly/monthly usage charts
- [ ] Export usage data (CSV/JSON)
- [ ] Cost estimation per engine (configurable rates)

**Storage**: SQLite (local) / PostgreSQL (production) - same pattern as existing data.

---

### 🎮 Priority 2: Playground / Demo Page

**Goal**: Let developers try voices before integrating.

- [ ] Voice browser with search/filter
- [ ] Text input with character count
- [ ] Engine selector
- [ ] Play audio in browser
- [ ] Show request/response for learning
- [ ] Generate code snippets (curl, Python, JavaScript)
- [ ] Compare voices side-by-side (optional)

**Note**: Should work without authentication for public demos, or require API key for private instances.

---

### 📝 Priority 3: SSML Editor with Speech Markdown

**Goal**: Visual editor for advanced TTS control.

- [ ] [Speech Markdown](https://www.speechmarkdown.org/) support
- [ ] Live preview (convert to SSML)
- [ ] Visual controls for:
  - Pauses/breaks
  - Emphasis
  - Prosody (rate, pitch, volume)
  - Say-as (dates, numbers, spelled-out)
  - Phonemes/pronunciation
- [ ] Template library (common patterns)
- [ ] Engine compatibility indicators (not all engines support all SSML)
- [ ] Save/load templates per API key

**Why Speech Markdown?**: More readable than raw SSML, converts to engine-specific SSML automatically.

---

### 🔄 Priority 4: Streaming Support (Optional)

**Goal**: Real-time audio for conversational AI / chatbots.

**Approach**: 
- Add as **optional feature** in admin UI per API key
- **Do NOT change existing endpoints** - maintain ElevenLabs compatibility
- New dedicated streaming endpoint: `/api/tts/stream`
- WebSocket or SSE-based delivery
- Only for engines that support streaming natively

**Concerns**:
- Keep existing API stable
- Don't break ESP32/lightweight clients
- Mark clearly as "experimental" initially

---

## Under Consideration

### 🎤 OpenAI Whisper Emulation

Emulate OpenAI's TTS endpoints (similar approach to ElevenLabs emulation).

```
POST /v1/audio/speech
{
  "model": "tts-1",
  "input": "Hello world",
  "voice": "alloy"
}
```

**Pros**: 
- Familiar to OpenAI users
- Growing ecosystem of OpenAI-compatible tools

**Cons**:
- Similar to ElevenLabs emulation we already have
- Maintenance overhead for another API surface

**Decision**: Defer until there's clear demand.

---

### 💾 Caching Layer

**Idea**: Cache identical TTS requests to reduce API costs.

**Security Concerns**:
- Cached audio could contain sensitive text
- Multi-tenant environments need isolation
- Cache invalidation complexity
- Storage costs for audio files

**If implemented**:
- Opt-in per API key
- Hash-based cache keys (text + voice + settings)
- Configurable TTL
- Separate cache per API key (isolation)
- Clear cache option in admin UI

**Decision**: Defer - security implications need careful design.

---

### ❌ Not Planned

| Feature | Reason |
|---------|--------|
| **Automatic Fallback** | Adds complexity, unpredictable behavior, users should choose their engine |
| **Voice Cloning Management** | Out of scope - use native engine UIs |
| **Translation Pipeline** | Scope creep - use dedicated translation services |
| **Multi-tenancy/Orgs** | Keep it simple - one admin, multiple API keys is enough |

---

## Technical Notes

### Lightweight Principles
1. **No heavy dependencies** - Runs on low-spec servers
2. **SQLite for local** - No database server required
3. **Static admin UI** - No SSR complexity
4. **Optional engines** - Only load what's configured
5. **Minimal memory footprint** - Important for Electron/embedded

### Compatibility Commitments
- ESP32 endpoint will remain simple and stable
- ElevenLabs emulation will maintain compatibility
- Breaking changes only in major versions
- New features are additive, not replacing

---

## Contributing

We welcome contributions! Priority areas:
1. Usage Dashboard implementation
2. Playground demo page
3. Speech Markdown integration
4. Documentation and examples

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

