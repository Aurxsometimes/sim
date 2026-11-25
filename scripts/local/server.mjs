// Tiny HTTPS server for SIM's local install (https://localhost:8080).
// Serves the built site from ./site next to this file, only to this PC (loopback addresses).
// Started by launch.ps1; set up by scripts/setup-local.ps1.

import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:https';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const home = dirname(fileURLToPath(import.meta.url));
const root = join(home, 'site');
const port = 8080;

const tls = {
  pfx: readFileSync(join(home, 'localhost.pfx')),
  passphrase: readFileSync(join(home, 'localhost.pass'), 'utf8').trim(),
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

// Files that must always be re-checked so updates show up
const noCache = new Set([
  'index.html',
  'return.html',
  'backup.html',
  'service-worker.js',
  'version.json',
]);

function resolveFile(urlPath) {
  let path = decodeURIComponent(urlPath);
  if (path === '/return' || path === '/backup') {
    path += '.html';
  }
  const file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    return undefined; // outside the site folder
  }
  try {
    if (statSync(file).isFile()) {
      return file;
    }
  } catch {}
  // Single-page app: unknown paths without a file extension get index.html
  return extname(path) ? undefined : join(root, 'index.html');
}

function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let file;
  try {
    file = resolveFile(new URL(req.url, 'https://localhost').pathname);
  } catch {
    file = undefined;
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const name = file.slice(root.length + 1).replaceAll('\\', '/');
  res.writeHead(200, {
    'Content-Type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': noCache.has(name) ? 'no-cache' : 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

// "localhost" can mean either address, so listen on both - but never on the network
for (const host of ['127.0.0.1', '::1']) {
  createServer(tls, handler)
    .on('error', (e) => {
      console.error(`SIM local server (${host}):`, e.message);
      if (host === '127.0.0.1') {
        process.exit(1);
      }
    })
    .listen(port, host);
}
console.log(`SIM is running at https://localhost:${port}`);
