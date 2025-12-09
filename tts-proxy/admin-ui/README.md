# OpenVoiceProxy Admin UI

Admin interface for OpenVoiceProxy built with Vue 3, TypeScript, and Vite.

## Features

- API Key Management
- Engine Configuration
- Usage Dashboard
- Settings Management
- CLI Config Generator (optional)

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The built files will be output to `../public/admin/`.

## Environment Variables

Create a `.env` file (see `.env.example`) to configure the admin UI:

### CLI Config Generator

The CLI Config Generator can be disabled in production deployments:

```env
# Set to 'false' to hide CLI Config Generator in production
VITE_ENABLE_CLI_CONFIG=false
```

**Default behavior:**
- CLI Config Generator is **enabled** by default
- Set `VITE_ENABLE_CLI_CONFIG=false` to hide it in production

**Use case:** The CLI Config Generator is useful for development and testing, but you may want to hide it in production deployments (e.g., on Digital Ocean) where users shouldn't have access to CLI configuration tools.

## Project Setup

This project uses Vue 3 `<script setup>` SFCs. Learn more:
- [Script Setup Docs](https://v3.vuejs.org/api/sfc-script-setup.html#sfc-script-setup)
- [Vue TypeScript Guide](https://vuejs.org/guide/typescript/overview.html#project-setup)
