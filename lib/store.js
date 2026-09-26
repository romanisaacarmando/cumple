// Almacenamiento clave/valor.
// En producción usa Upstash Redis (API REST, sin dependencias).
// En desarrollo y tests, si no hay credenciales, usa un Map en memoria.

// Vercel puede agregar un prefijo a los nombres (p. ej. STORAGE_KV_REST_API_URL),
// así que aceptamos cualquier variable que termine en KV_REST_API_URL o REDIS_REST_URL.
export function findRedisCredentials(env) {
  const urlKeys = Object.keys(env)
    .filter((k) => /(^|_)(KV_REST_API|REDIS_REST)_URL$/.test(k) && env[k])
    .sort((a, b) => a.length - b.length);
  for (const urlKey of urlKeys) {
    const token = env[urlKey.replace(/_URL$/, '_TOKEN')];
    if (token) return { url: env[urlKey], token };
  }
  return null;
}

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
  const credentials = findRedisCredentials(process.env);
  if (credentials) {
    defaultStore = createRedisStore(credentials.url, credentials.token);
  } else if (process.env.VERCEL) {
    // En Vercel sin base de datos los datos se perderían: mejor avisar.
    // Mostramos solo los nombres de las variables parecidas, nunca sus valores.
    const similar = Object.keys(process.env).filter((k) => /KV|REDIS|UPSTASH/.test(k));
    throw new StoreNotConfiguredError(
      'La base de datos no está configurada. Conectá Upstash Redis al proyecto en Vercel y hacé Redeploy (ver README). ' +
        (similar.length ? `Variables encontradas: ${similar.join(', ')}.` : 'No se encontró ninguna variable de Upstash.'),
    );
  } else {
    defaultStore = createMemoryStore();
  }
  return defaultStore;
}
