import http from 'node:http';

export function postJson(port, path, bodyObj) {
  return new Promise((resolve) => {
    const body = JSON.stringify(bodyObj);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 2000,
      },
      (res) => {
        res.resume();
        resolve();
      }
    );
    req.on('error', () => resolve());
    req.on('timeout', () => {
      req.destroy();
      resolve();
    });
    req.write(body);
    req.end();
  });
}
