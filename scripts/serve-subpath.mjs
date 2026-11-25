import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const prefix = '/asia-trip/';
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};

if (!existsSync(resolve(root, 'index.html'))) {
  throw new Error('Build the app first with `npm run build`.');
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/asia-trip') {
    response.writeHead(308, { Location: prefix });
    response.end();
    return;
  }
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404).end('Not found');
    return;
  }

  const pathPart = decodeURIComponent(url.pathname.slice(prefix.length));
  const relativePath = pathPart || 'index.html';
  const filePath = resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${sep}`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404).end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(filePath).pipe(response);
}).listen(4173, '127.0.0.1', () => {
  process.stdout.write('Serving dist at http://127.0.0.1:4173/asia-trip/\n');
});
