/**
 * Native eSpeak Engine
 * Calls espeak directly via child_process for reliable audio output
 */

import { spawn } from 'child_process';
import { BaseEngine, type BaseEngineConfig } from './base-engine.js';
import type { Voice } from '../../domain/entities/voice.js';
import { Voice as VoiceEntity } from '../../domain/entities/voice.js';
import type { SpeechRequest } from '../../types/tts.types.js';

interface EspeakVoice {
  name: string;
  language: string;
  gender: string;
  identifier: string;
}

export class NativeEspeakEngine extends BaseEngine {
  readonly engineId = 'espeak' as const;
  private espeakVoices: EspeakVoice[] = [];

  constructor(config: BaseEngineConfig) {
    super(config);
  }

  protected async doInitialize(): Promise<void> {
    // Check if espeak is installed
    try {
      await this.runEspeak(['--version']);
    } catch {
      throw new Error('espeak is not installed or not in PATH');
    }

    // Fetch available voices
    this.espeakVoices = await this.fetchEspeakVoices();
  }

  private async runEspeak(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('espeak-ng', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          // Try fallback to 'espeak' command
          const fallbackProc = spawn('espeak', args, { stdio: ['pipe', 'pipe', 'pipe'] });
          let fallbackStdout = '';

          fallbackProc.stdout.on('data', (data) => {
            fallbackStdout += data.toString();
          });

          fallbackProc.on('close', (fallbackCode) => {
            if (fallbackCode === 0) {
              resolve(fallbackStdout);
            } else {
              reject(new Error(`espeak failed: ${stderr}`));
            }
          });

          fallbackProc.on('error', () => {
            reject(new Error(`espeak not found`));
          });
        }
      });

      proc.on('error', () => {
        // Try fallback
        const fallbackProc = spawn('espeak', args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let fallbackStdout = '';

        fallbackProc.stdout.on('data', (data) => {
          fallbackStdout += data.toString();
        });

        fallbackProc.on('close', (fallbackCode) => {
          if (fallbackCode === 0) {
            resolve(fallbackStdout);
          } else {
            reject(new Error('espeak not found'));
          }
        });

        fallbackProc.on('error', () => {
          reject(new Error('espeak not found'));
        });
      });
    });
  }

  private async fetchEspeakVoices(): Promise<EspeakVoice[]> {
    try {
      const output = await this.runEspeak(['--voices']);
      const lines = output.split('\n').slice(1); // Skip header
      const voices: EspeakVoice[] = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        // Parse: Pty Language Age/Gender VoiceName File Other Languages
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 4) {
          const langCode = parts[1] || 'en';
          const ageGender = parts[2] || 'M';
          const name = parts[3] || 'default';

          voices.push({
            name: name,
            language: langCode,
            gender: ageGender.includes('F') ? 'female' : 'male',
            identifier: langCode, // Use language code as identifier (espeak needs this)
          });
        }
      }

      return voices;
    } catch {
      // Return default voice if listing fails
      return [{ name: 'en', language: 'en', gender: 'male', identifier: 'en' }];
    }
  }

  protected async fetchVoices(): Promise<Voice[]> {
    return this.espeakVoices.map((v) =>
      VoiceEntity.fromEngineVoice('espeak', {
        id: v.identifier,
        name: `${v.name} (eSpeak)`,
        language: v.language,
        languageCode: v.language.split('-')[0] || 'en',
        gender: v.gender,
      })
    );
  }

  protected async doSynthesize(request: SpeechRequest): Promise<Buffer> {
    // Extract voice ID
    let voiceId = request.voiceId;
    if (voiceId.includes(':')) {
      voiceId = voiceId.split(':')[1] || 'en';
    }

    // Build espeak arguments
    const args: string[] = [
      '-v', voiceId,
      '--stdout', // Output to stdout as WAV
    ];

    // Add speed if specified
    if (request.voiceSettings?.speed) {
      const speed = Math.round(175 * request.voiceSettings.speed);
      args.push('-s', speed.toString());
    }

    // Add pitch if specified
    if (request.voiceSettings?.pitch) {
      const pitch = Math.round(50 * request.voiceSettings.pitch);
      args.push('-p', pitch.toString());
    }

    // Add the text
    args.push(request.text);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      // Try espeak-ng first, fall back to espeak
      let proc = spawn('espeak-ng', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let usedFallback = false;

      const handleProcess = (childProcess: ReturnType<typeof spawn>) => {
        childProcess.stdout?.on('data', (data: Buffer) => {
          chunks.push(data);
        });

        childProcess.stderr?.on('data', (data: Buffer) => {
          // espeak sometimes outputs info to stderr, ignore it
          const msg = data.toString();
          if (msg.includes('error') || msg.includes('Error')) {
            console.warn('[espeak] stderr:', msg);
          }
        });

        childProcess.on('close', (code) => {
          if (code === 0 && chunks.length > 0) {
            resolve(Buffer.concat(chunks));
          } else if (!usedFallback) {
            // Try fallback to espeak
            usedFallback = true;
            chunks.length = 0;
            const fallbackProc = spawn('espeak', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            handleProcess(fallbackProc);
            fallbackProc.on('error', () => {
              reject(new Error('espeak synthesis failed'));
            });
          } else {
            reject(new Error(`espeak exited with code ${code}`));
          }
        });

        childProcess.on('error', () => {
          if (!usedFallback) {
            usedFallback = true;
            chunks.length = 0;
            const fallbackProc = spawn('espeak', args, { stdio: ['pipe', 'pipe', 'pipe'] });
            handleProcess(fallbackProc);
            fallbackProc.on('error', () => {
              reject(new Error('espeak not found'));
            });
          }
        });
      };

      handleProcess(proc);
    });
  }
}
