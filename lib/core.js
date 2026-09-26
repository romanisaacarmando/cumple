// Lógica de la lista de regalos, independiente del servidor HTTP.
//
// Claves en el store:
//   list:{id}                      -> JSON con los datos de la lista y sus regalos
//   resv:{id}:{giftId}:{slot}      -> JSON con una reserva (slot 0, y slot 1 si es compartido)
//
// Las reservas usan SET NX, así dos amigos que tocan "Lo regalo yo" al mismo
// tiempo nunca pueden quedarse con el mismo lugar.

import crypto from 'node:crypto';

export const MAX_GIFTS = 100;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomId(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

function randomToken() {
  return crypto.randomBytes(24).toString('base64url');
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ---------- validación ----------

function text(value, { field, max, required = false }) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new HttpError(400, `Falta completar: ${field}`);
  if (v.length > max) throw new HttpError(400, `${field} es demasiado largo (máximo ${max} caracteres)`);
  return v;
}

function link(value) {
  const v = text(value, { field: 'El link', max: 500 });
  if (!v) return '';
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
  } catch {
    throw new HttpError(400, 'El link no es válido');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpError(400, 'El link no es válido');
  return url.toString();
}

function date(value) {
  const v = text(value, { field: 'La fecha', max: 10 });
  if (!v) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new HttpError(400, 'La fecha no es válida');
  }
  return v;
}

function listFields(input) {
  return {
    ownerName: text(input.ownerName, { field: 'Tu nombre', max: 40, required: true }),
    date: date(input.date),
    message: text(input.message, { field: 'El mensaje', max: 300 }),
  };
}

function giftFields(input) {
  return {
    title: text(input.title, { field: 'El regalo', max: 80, required: true }),
    note: text(input.note, { field: 'La nota', max: 200 }),
    link: link(input.link),
    price: text(input.price, { field: 'El precio', max: 30 }),
    shared: Boolean(input.shared),
  };
}

// ---------- helpers de store ----------

const listKey = (id) => `list:${id}`;
const resvKey = (id, giftId, slot) => `resv:${id}:${giftId}:${slot}`;
const slotsOf = (gift) => (gift.shared ? 2 : 1);

async function loadList(store, id) {
  if (typeof id !== 'string' || !/^[a-z0-9]{4,20}$/.test(id)) throw new HttpError(404, 'La lista no existe');
  const raw = await store.get(listKey(id));
  if (!raw) throw new HttpError(404, 'La lista no existe');
  return JSON.parse(raw);
}

async function saveList(store, list) {
  await store.set(listKey(list.id), JSON.stringify(list));
}

function findGift(list, giftId) {
  const gift = list.gifts.find((g) => g.id === giftId);
  if (!gift) throw new HttpError(404, 'Ese regalo ya no está en la lista');
  return gift;
}

// Devuelve, para cada regalo, un array con sus reservas (null = lugar libre).
async function loadReservations(store, list) {
  const keys = [];
  for (const g of list.gifts) for (let s = 0; s < slotsOf(g); s++) keys.push(resvKey(list.id, g.id, s));
  const values = await store.mget(keys);
  const result = new Map();
  let i = 0;
  for (const g of list.gifts) {
    const slots = [];
    for (let s = 0; s < slotsOf(g); s++) {
      const raw = values[i++];
      slots.push(raw ? JSON.parse(raw) : null);
    }
    result.set(g.id, slots);
  }
  return result;
}

function requireAdmin(list, key) {
  if (typeof key !== 'string' || !key || !safeEqual(hash(key), list.adminKeyHash)) {
    throw new HttpError(403, 'El link de administración no es válido');
  }
}

const publicListInfo = (list) => ({
  id: list.id,
  ownerName: list.ownerName,
  date: list.date,
  message: list.message,
});

const publicGiftInfo = (g) => ({
  id: g.id,
  title: g.title,
  note: g.note,
  link: g.link,
  price: g.price,
  shared: g.shared,
  slots: slotsOf(g),
});

// ---------- operaciones ----------

export async function createList(store, input) {
  const fields = listFields(input);
  const adminKey = randomToken();
  for (let attempt = 0; attempt < 5; attempt++) {
    const list = {
      id: randomId(8),
      ...fields,
      adminKeyHash: hash(adminKey),
      createdAt: new Date().toISOString(),
      gifts: [],
    };
    if (await store.set(listKey(list.id), JSON.stringify(list), { nx: true })) {
      return { id: list.id, adminKey };
    }
  }
  throw new HttpError(500, 'No se pudo crear la lista, probá de nuevo');
}

// Vista para los amigos. Solo en regalos compartidos se muestra quién se
// anotó, para que el segundo sepa con quién coordinar.
export async function getPublicList(store, id) {
  const list = await loadList(store, id);
  const reservations = await loadReservations(store, list);
  return {
    ...publicListInfo(list),
    gifts: list.gifts.map((g) => ({
      ...publicGiftInfo(g),
      reservations: reservations
        .get(g.id)
        .filter(Boolean)
        .map((r) => (g.shared ? { rid: r.rid, name: r.name } : { rid: r.rid })),
    })),
  };
}

// Vista del cumpleañero: ve cuántos lugares están tomados, nunca quién.
export async function getAdminList(store, id, key) {
  const list = await loadList(store, id);
  requireAdmin(list, key);
  const reservations = await loadReservations(store, list);
  return {
    ...publicListInfo(list),
    gifts: list.gifts.map((g) => ({
      ...publicGiftInfo(g),
      taken: reservations.get(g.id).filter(Boolean).length,
    })),
  };
}

export async function reserveGift(store, { id, giftId, name }) {
  const list = await loadList(store, id);
  const gift = findGift(list, giftId);
  const reservation = {
    rid: randomId(10),
    name: text(name, { field: 'Tu nombre', max: 40, required: true }),
    at: new Date().toISOString(),
  };
  const token = randomToken();
  const value = JSON.stringify({ ...reservation, tokenHash: hash(token) });
  for (let s = 0; s < slotsOf(gift); s++) {
    if (await store.set(resvKey(id, giftId, s), value, { nx: true })) {
      return { rid: reservation.rid, token };
    }
  }
  throw new HttpError(409, 'Uy, alguien se te adelantó: ese regalo ya está elegido');
}

export async function releaseGift(store, { id, giftId, rid, token }) {
  const list = await loadList(store, id);
  const gift = findGift(list, giftId);
  for (let s = 0; s < slotsOf(gift); s++) {
    const key = resvKey(id, giftId, s);
    const raw = await store.get(key);
    if (!raw) continue;
    const r = JSON.parse(raw);
    if (r.rid !== rid) continue;
    if (typeof token !== 'string' || !safeEqual(hash(token), r.tokenHash)) {
      throw new HttpError(403, 'No podés liberar una reserva que no es tuya');
    }
    await store.del(key);
    return { ok: true };
  }
  return { ok: true }; // ya estaba liberada
}

export async function adminAction(store, { id, key, action, giftId, data = {} }) {
  const list = await loadList(store, id);
  requireAdmin(list, key);

  switch (action) {
    case 'updateList': {
      Object.assign(list, listFields(data));
      break;
    }
    case 'addGift': {
      if (list.gifts.length >= MAX_GIFTS) throw new HttpError(400, `La lista admite hasta ${MAX_GIFTS} regalos`);
      list.gifts.push({ id: randomId(6), ...giftFields(data) });
      break;
    }
    case 'updateGift': {
      const gift = findGift(list, giftId);
      const fields = giftFields(data);
      if (gift.shared && !fields.shared && (await store.get(resvKey(id, giftId, 1)))) {
        throw new HttpError(
          409,
          'Ya se anotó una segunda persona. Para dejar de compartirlo, primero liberá el regalo.',
        );
      }
      Object.assign(gift, fields);
      break;
    }
    case 'moveGift': {
      const index = list.gifts.findIndex((g) => g.id === giftId);
      if (index < 0) throw new HttpError(404, 'Ese regalo ya no está en la lista');
      const to = index + (data.direction === 'up' ? -1 : 1);
      if (to >= 0 && to < list.gifts.length) {
        [list.gifts[index], list.gifts[to]] = [list.gifts[to], list.gifts[index]];
      }
      break;
    }
    case 'deleteGift': {
      findGift(list, giftId);
      list.gifts = list.gifts.filter((g) => g.id !== giftId);
      await store.del(resvKey(id, giftId, 0), resvKey(id, giftId, 1));
      break;
    }
    case 'freeGift': {
      // Para cuando un amigo perdió el celu o cambió de idea sin liberar.
      findGift(list, giftId);
      await store.del(resvKey(id, giftId, 0), resvKey(id, giftId, 1));
      return getAdminList(store, id, key);
    }
    default:
      throw new HttpError(400, 'Acción desconocida');
  }

  await saveList(store, list);
  return getAdminList(store, id, key);
}
