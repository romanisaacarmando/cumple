// Servidor local para probar sin Vercel: `npm run dev` y abrir http://localhost:3000
// Imita lo que hace Vercel: sirve /public, ejecuta /api/*.js y aplica los rewrites.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const REWRITES = [
  [/^\/l\/[^/]+$/, '/lista.html'],
  [/^\/a\/[^/]+$/, '/admin.html'],
];

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);

  if (pathname.startsWith('/api/')) {
    const name = pathname.slice(5).replace(/[^a-z]/g, '');
    const file = path.join(root, 'api', `${name}.js`);
    try {
      await fs.access(file);
    } catch {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const mod = await import(pathToFileURL(file).href);
    req.query = Object.fromEntries(url.searchParams);
    req.body = await readBody(req);
    return mod.default(req, res);
  }

  for (const [pattern, target] of REWRITES) if (pattern.test(pathname)) pathname = target;
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.join(publicDir, path.normalize(pathname));
  if (!file.startsWith(publicDir)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    const content = await fs.readFile(file);
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(content);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(port, () => {
  console.log(`Lista de regalos en http://localhost:${port}`);
});
