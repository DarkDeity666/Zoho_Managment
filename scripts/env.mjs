import { readFileSync, existsSync } from 'node:fs';
export function env() {
  const values = {};
  if (existsSync('.env')) for (const raw of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const at = line.indexOf('=');
    if (at < 1) throw new Error('Invalid .env line');
    let value = line.slice(at + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[line.slice(0, at).trim()] = value;
  }
  return { ...values, ...process.env };
}
