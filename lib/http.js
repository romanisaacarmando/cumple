// Envoltorio común para las funciones de /api (Vercel y servidor local).

import { HttpError } from './core.js';
import { getStore, StoreNotConfiguredError } from './store.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// methods: { GET: (ctx) => result, POST: (ctx) => result }
export function handler(methods) {
  return async function (req, res) {
    const fn = methods[req.method];
    if (!fn) return send(res, 405, { error: 'Método no permitido' });
    try {
      const store = getStore();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await fn({ store, query: req.query || {}, body, headers: req.headers });
      send(res, 200, result);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      if (err instanceof StoreNotConfiguredError) return send(res, 503, { error: err.message });
      console.error(err);
      send(res, 500, { error: 'Algo salió mal. Probá de nuevo en un rato.' });
    }
  };
}
