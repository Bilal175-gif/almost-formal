import net from 'node:net';

export async function isPortTaken(port) {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close(() => resolve(false));
    });

    server.listen({ host: '0.0.0.0', port, exclusive: true });
  });
}

export async function getAvailableWebPort(startPort = 3000, maxAttempts = 20) {
  const preferredPort = Number.isInteger(startPort) && startPort > 0 ? startPort : 3000;

  for (let port = preferredPort; port < preferredPort + maxAttempts; port += 1) {
    if (!(await isPortTaken(port))) return port;
  }

  throw new Error(
    `Could not find a free web port between ${preferredPort} and ${preferredPort + maxAttempts - 1}.`,
  );
}
