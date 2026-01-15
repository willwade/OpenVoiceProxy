import path from 'node:path';
import os from 'node:os';

/**
 * Default CallTTS CLI config location, matching the CLI binary default.
 * Windows: %APPDATA%\OpenVoiceProxy\CallTTS\config.json
 * macOS: ~/Library/Application Support/OpenVoiceProxy/CallTTS/config.json
 * Linux: $XDG_CONFIG_HOME/OpenVoiceProxy/CallTTS/config.json or ~/.config/OpenVoiceProxy/CallTTS/config.json
 */
export function getCliConfigPath(): string {
  const appName = 'OpenVoiceProxy';
  const cliName = 'CallTTS';

  let base: string;
  if (process.platform === 'win32') {
    base = process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming');
  } else if (process.platform === 'darwin') {
    base = path.join(os.homedir(), 'Library', 'Application Support');
  } else {
    base = process.env['XDG_CONFIG_HOME'] || path.join(os.homedir(), '.config');
  }

  return path.join(base, appName, cliName, 'config.json');
}
