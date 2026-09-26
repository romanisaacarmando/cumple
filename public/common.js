// Utilidades compartidas por las páginas.

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export async function api(path, { method = 'GET', body, adminKey } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (adminKey) headers['x-admin-key'] = adminKey;
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error('No hay conexión. Revisá tu internet y probá de nuevo.'), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Algo salió mal'), { status: res.status });
  return data;
}

// localStorage puede fallar (modo privado, etc.): nunca debe romper la página.
export const saved = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(`cumple:${key}`);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`cumple:${key}`, JSON.stringify(value));
    } catch {
      /* sin almacenamiento local */
    }
  },
};

// Guarda las listas creadas en este dispositivo para poder volver al panel.
export function rememberAdmin(id, adminKey, ownerName) {
  const mine = saved.get('mine', []).filter((l) => l.id !== id);
  mine.unshift({ id, adminKey, ownerName });
  saved.set('mine', mine.slice(0, 10));
}

let toastTimer;
export function toast(message, { error = false } = {}) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  el.classList.toggle('error', error);
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), error ? 4500 : 2500);
}

export function formatDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export const publicUrl = (id) => `${location.origin}/l/${id}`;
export const adminUrl = (id, key) => `${location.origin}/a/${id}#k=${encodeURIComponent(key)}`;

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copy(text, message = '¡Link copiado!') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    window.prompt('Copiá el link:', text);
  }
}

export function idFromPath() {
  return decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
}
