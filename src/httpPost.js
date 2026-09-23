import http from 'node:http';

export function postJson(port, path, bodyObj) {
  return new Promise((resolve) => {
    const body = JSON.stringify(bodyObj);
    try {
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
    } catch {
      // http.request() validates its options (e.g. port range/type) synchronously and
      // throws before any listener can be attached. Catch that here so postJson truly
      // never rejects, independent of any caller's try/catch.
      resolve();
    }
  });
}
