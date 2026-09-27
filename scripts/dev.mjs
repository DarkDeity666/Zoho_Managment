import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
mkdirSync('.cache/go-build', { recursive: true });
const children = [
  spawn('go', ['run', './apps/api'], { stdio: 'inherit', env: { ...process.env, GOCACHE: resolve('.cache/go-build') } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.js'], { stdio: 'inherit' })
];
let stopping = false;
function stop(code = 0) { if (stopping) return; stopping = true; for (const child of children) child.kill(); process.exitCode = code; }
children.forEach(child => { child.on('error', err => { console.error(err.message); stop(1); }); child.on('exit', code => stop(code || 0)); });
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
