import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadEnv(fromUrl: string): void {
  const dir = dirname(fileURLToPath(fromUrl));

  config({ path: resolve(dir, '../../.env') });
  config({ path: resolve(dir, '../../.env.local') });
  config({ path: resolve(dir, '../.env') });
  config({ path: resolve(dir, '../.env.local') });
}
