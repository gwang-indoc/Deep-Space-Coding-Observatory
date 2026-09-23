import net from 'node:net';

export function findFreePort(preferredPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code !== 'EADDRINUSE') {
        reject(err);
        return;
      }
      const fallback = net.createServer();
      fallback.once('error', reject);
      fallback.listen(0, '127.0.0.1', () => {
        const { port } = fallback.address();
        fallback.close(() => resolve(port));
      });
    });
    server.listen(preferredPort, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
