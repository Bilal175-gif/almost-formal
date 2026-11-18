import { spawn } from 'node:child_process';
import process from 'node:process';
import { getAvailablePort, isPortTaken } from './resolve-web-port.mjs';

const isAlmostFormalApi = async (port) => {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(500),
    });
    const health = await response.json();
    return response.ok && health.ok === true && health.service === 'almost-formal-api';
  } catch {
    return false;
  }
};

const requestedMode = process.argv[2] || 'dev';
const mode = requestedMode === 'start' ? 'start' : 'dev';
const service = requestedMode === 'dev:api' ? 'api' : requestedMode === 'dev:web' ? 'web' : null;
const requestedPort = Number(process.env.WEB_PORT || 3000);
const webPort = service === 'api' ? requestedPort : await getAvailablePort(requestedPort);

const requestedApiPort = Number(process.env.PORT || 4100);
const apiPort = service ? requestedApiPort : await getAvailablePort(requestedApiPort);

if (service && await isPortTaken(apiPort)) {
  if (service === 'api') {
    throw new Error(`Port ${apiPort} is already in use. Set PORT to a free port in .env for both terminals.`);
  }
  if (!(await isAlmostFormalApi(apiPort))) {
    throw new Error(`Port ${apiPort} belongs to another service. Set PORT to a free port in .env for both terminals, then restart both commands.`);
  }
}

process.env.WEB_PORT = String(webPort);
process.env.APP_ORIGIN = `http://localhost:${webPort}`;
process.env.PORT = String(apiPort);
process.env.API_URL = `http://127.0.0.1:${apiPort}`;

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

  return child;
};

if (service) {
  const child = runCommand(commands.dev[service]);
  const shutdown = () => child.kill('SIGTERM');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
} else {
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
}
