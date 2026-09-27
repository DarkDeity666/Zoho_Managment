import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
mkdirSync('.cache', { recursive: true });
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  writeFileSync('.env', readFileSync('.env', 'utf8').replace('change-this-to-a-long-random-password', randomBytes(24).toString('base64url')));
  console.log('Created .env with a random staff password. Read APP_ADMIN_PASSWORD locally to sign in.');
} else console.log('Kept existing .env.');
