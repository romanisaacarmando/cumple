// Almacenamiento clave/valor.
// En producción usa una tabla `kv` de Supabase a través de su API REST (sin dependencias).
// En desarrollo y tests, si no hay credenciales, usa un Map en memoria.

export class StoreNotConfiguredError extends Error {}

export function findSupabaseCredentials(env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

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

// La tabla se crea con supabase.sql. La clave secreta saltea RLS, así que
// solo el servidor puede leer o escribir: los navegadores nunca la ven.
export function createSupabaseStore(baseUrl, secretKey, fetchImpl = fetch) {
  const endpoint = `${baseUrl}/rest/v1/kv`;
  const headers = { apikey: secretKey, 'Content-Type': 'application/json' };
  // Las claves viejas (service_role) son JWT y además van en Authorization.
  if (secretKey.startsWith('eyJ')) headers.Authorization = `Bearer ${secretKey}`;

  const inList = (keys) => `in.(${keys.map((k) => `"${k}"`).join(',')})`;

  async function request(method, query, { body, prefer } = {}) {
    const res = await fetchImpl(`${endpoint}?${new URLSearchParams(query)}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text).message || text;
      } catch {
        /* texto plano */
      }
      throw new Error(`Supabase ${method} falló (${res.status}): ${detail}`);
    }
    return text ? JSON.parse(text) : null;
  }

  return {
    async get(key) {
      const rows = await request('GET', { select: 'value', key: `eq.${key}` });
      return rows.length ? rows[0].value : null;
    },
    async mget(keys) {
      if (keys.length === 0) return [];
      const rows = await request('GET', { select: 'key,value', key: inList(keys) });
      const found = new Map(rows.map((r) => [r.key, r.value]));
      return keys.map((k) => (found.has(k) ? found.get(k) : null));
    },
    async set(key, value, { nx = false } = {}) {
      // nx: INSERT ... ON CONFLICT DO NOTHING. Si la clave ya existía no vuelve ninguna fila.
      const rows = await request('POST', nx ? {} : { on_conflict: 'key' }, {
        body: [{ key, value }],
        prefer: `return=representation,resolution=${nx ? 'ignore' : 'merge'}-duplicates`,
      });
      return rows.length > 0;
    },
    async del(...keys) {
      if (keys.length) await request('DELETE', { key: inList(keys) });
    },
  };
}

let defaultStore;

export function getStore() {
  if (defaultStore) return defaultStore;
  const credentials = findSupabaseCredentials(process.env);
  if (credentials) {
    defaultStore = createSupabaseStore(credentials.url, credentials.key);
  } else if (process.env.VERCEL) {
    // En Vercel sin base de datos los datos se perderían: mejor avisar.
    // Mostramos solo los nombres de las variables parecidas, nunca sus valores.
    const similar = Object.keys(process.env).filter((k) => k.includes('SUPABASE'));
    throw new StoreNotConfiguredError(
      'La base de datos no está configurada. Cargá SUPABASE_URL y SUPABASE_SECRET_KEY en Vercel y hacé Redeploy (ver README). ' +
        (similar.length ? `Variables encontradas: ${similar.join(', ')}.` : 'No se encontró ninguna variable de Supabase.'),
    );
  } else {
    defaultStore = createMemoryStore();
  }
  return defaultStore;
}
