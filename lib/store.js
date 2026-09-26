// Almacenamiento clave/valor.
// En producción usa Upstash Redis (API REST, sin dependencias).
// En desarrollo y tests, si no hay credenciales, usa un Map en memoria.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export class StoreNotConfiguredError extends Error {}

export function createMemoryStore() {
  const data = new Map();
  return {
    async get(key) {
      return data.has(key) ? data.get(key) : null;
    },
    async mget(keys) {
      return keys.map((k) => (data.has(k) ? data.get(k) : null));
    },
    async set(key, value, { nx = false } = {}) {
      if (nx && data.has(key)) return false;
      data.set(key, value);
      return true;
    },
    async del(...keys) {
      for (const k of keys) data.delete(k);
    },
  };
}

export function createRedisStore(url, token) {
  async function command(args) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.error) {
      throw new Error(`Redis ${args[0]} falló: ${body.error || res.status}`);
    }
    return body.result;
  }

  return {
    async get(key) {
      return command(['GET', key]);
    },
    async mget(keys) {
      if (keys.length === 0) return [];
      return command(['MGET', ...keys]);
    },
    async set(key, value, { nx = false } = {}) {
      const args = ['SET', key, value];
      if (nx) args.push('NX');
      return (await command(args)) === 'OK';
    },
    async del(...keys) {
      if (keys.length) await command(['DEL', ...keys]);
    },
  };
}

let defaultStore;

export function getStore() {
  if (defaultStore) return defaultStore;
  if (REDIS_URL && REDIS_TOKEN) {
    defaultStore = createRedisStore(REDIS_URL, REDIS_TOKEN);
  } else if (process.env.VERCEL) {
    // En Vercel sin base de datos los datos se perderían: mejor avisar.
    throw new StoreNotConfiguredError(
      'La base de datos no está configurada. Conectá Upstash Redis al proyecto en Vercel (ver README).',
    );
  } else {
    defaultStore = createMemoryStore();
  }
  return defaultStore;
}
