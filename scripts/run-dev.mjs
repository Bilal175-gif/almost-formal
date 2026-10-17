import { spawn } from 'node:child_process';
import process from 'node:process';
import { getAvailableWebPort } from './resolve-web-port.mjs';

const mode = process.argv[2] === 'start' ? 'start' : 'dev';
const requestedPort = Number(process.env.WEB_PORT || 3000);
const webPort = await getAvailableWebPort(requestedPort);

process.env.WEB_PORT = String(webPort);
process.env.APP_ORIGIN = `http://localhost:${webPort}`;

const commands = {
  dev: {
    api: 'npm run dev -w @almost-formal/api',
    web: 'npm run dev -w @almost-formal/web',
  },
  start: {
    api: 'npm start -w @almost-formal/api',
    web: 'npm start -w @almost-formal/web',
  },
};

const runCommand = (command) => {
  const child = spawn(command, {
    shell: true,
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (code !== 0) {
      process.exit(code ?? (signal ? 1 : 0));
    }
  });

  return child;
};

const api = runCommand(commands[mode].api);
const web = runCommand(commands[mode].web);

const shutdown = () => {
  api.kill('SIGTERM');
  web.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

api.on('exit', (code, signal) => {
  if (code !== 0 || signal) {
    web.kill('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  }
});

web.on('exit', (code, signal) => {
  if (code !== 0 || signal) {
    api.kill('SIGTERM');
    process.exit(code ?? (signal ? 1 : 0));
  }
});
