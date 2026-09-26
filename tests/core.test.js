import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminAction,
  createList,
  getAdminList,
  getPublicList,
  releaseGift,
  reserveGift,
} from '../lib/core.js';
import { createMemoryStore, createSupabaseStore, findSupabaseCredentials } from '../lib/store.js';

async function setup() {
  const store = createMemoryStore();
  const { id, adminKey } = await createList(store, { ownerName: 'Román', date: '2026-10-12', message: 'Gracias!' });
  const add = (data) => adminAction(store, { id, key: adminKey, action: 'addGift', data });
  return { store, id, adminKey, add };
}

test('crea una lista y la muestra vacía', async () => {
  const { store, id } = await setup();
  const list = await getPublicList(store, id);
  assert.equal(list.ownerName, 'Román');
  assert.equal(list.date, '2026-10-12');
  assert.deepEqual(list.gifts, []);
  assert.equal(list.adminKeyHash, undefined);
});

test('valida los datos de la lista', async () => {
  const store = createMemoryStore();
  await assert.rejects(createList(store, { ownerName: '  ' }), { status: 400 });
  await assert.rejects(createList(store, { ownerName: 'A', date: 'mañana' }), { status: 400 });
});

test('solo el administrador puede editar', async () => {
  const { store, id } = await setup();
  await assert.rejects(adminAction(store, { id, key: 'otra', action: 'addGift', data: { title: 'x' } }), {
    status: 403,
  });
  await assert.rejects(getAdminList(store, id, undefined), { status: 403 });
});

test('un regalo normal lo puede reservar una sola persona', async () => {
  const { store, id, add } = await setup();
  const admin = await add({ title: 'Libro', link: 'example.com/libro', price: '$20.000' });
  const gift = admin.gifts[0];
  assert.equal(gift.link, 'https://example.com/libro');
  assert.equal(gift.slots, 1);

  await reserveGift(store, { id, giftId: gift.id, name: 'Ana' });
  await assert.rejects(reserveGift(store, { id, giftId: gift.id, name: 'Beto' }), { status: 409 });
});

test('dos amigos a la vez: solo uno se queda con el regalo', async () => {
  const { store, id, add } = await setup();
  const gift = (await add({ title: 'Libro' })).gifts[0];
  const results = await Promise.allSettled(
    ['Ana', 'Beto', 'Caro'].map((name) => reserveGift(store, { id, giftId: gift.id, name })),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});

test('un regalo compartido admite exactamente dos personas', async () => {
  const { store, id, add } = await setup();
  const gift = (await add({ title: 'Bici', shared: true })).gifts[0];
  assert.equal(gift.slots, 2);

  await reserveGift(store, { id, giftId: gift.id, name: 'Ana' });
  await reserveGift(store, { id, giftId: gift.id, name: 'Beto' });
  await assert.rejects(reserveGift(store, { id, giftId: gift.id, name: 'Caro' }), { status: 409 });

  const pub = await getPublicList(store, id);
  assert.deepEqual(
    pub.gifts[0].reservations.map((r) => r.name),
    ['Ana', 'Beto'],
  );
});

test('modo sorpresa: el cumpleañero no ve quién regala', async () => {
  const { store, id, adminKey, add } = await setup();
  const gift = (await add({ title: 'Libro' })).gifts[0];
  await reserveGift(store, { id, giftId: gift.id, name: 'Ana' });

  const admin = await getAdminList(store, id, adminKey);
  assert.equal(admin.gifts[0].taken, 1);
  assert.ok(!JSON.stringify(admin).includes('Ana'));

  // En regalos individuales los amigos tampoco ven el nombre.
  const pub = await getPublicList(store, id);
  assert.ok(!JSON.stringify(pub).includes('Ana'));
});

test('liberar requiere el token de quien reservó', async () => {
  const { store, id, add } = await setup();
  const gift = (await add({ title: 'Libro' })).gifts[0];
  const { rid, token } = await reserveGift(store, { id, giftId: gift.id, name: 'Ana' });

  await assert.rejects(releaseGift(store, { id, giftId: gift.id, rid, token: 'falso' }), { status: 403 });
  await releaseGift(store, { id, giftId: gift.id, rid, token });
  await reserveGift(store, { id, giftId: gift.id, name: 'Beto' });
});

test('en un compartido, si se va el primero, el lugar queda libre para otro', async () => {
  const { store, id, add } = await setup();
  const gift = (await add({ title: 'Bici', shared: true })).gifts[0];
  const ana = await reserveGift(store, { id, giftId: gift.id, name: 'Ana' });
  await reserveGift(store, { id, giftId: gift.id, name: 'Beto' });
  await releaseGift(store, { id, giftId: gift.id, ...ana });
  await reserveGift(store, { id, giftId: gift.id, name: 'Caro' });
  const pub = await getPublicList(store, id);
  assert.deepEqual(pub.gifts[0].reservations.map((r) => r.name).sort(), ['Beto', 'Caro']);
});

test('el cumpleañero puede liberar, editar, mover y borrar regalos', async () => {
  const { store, id, adminKey, add } = await setup();
  await add({ title: 'Libro' });
  const gifts = (await add({ title: 'Bici', shared: true })).gifts;
  const [libro, bici] = gifts;
  const act = (action, giftId, data) => adminAction(store, { id, key: adminKey, action, giftId, data });

  await reserveGift(store, { id, giftId: libro.id, name: 'Ana' });
  assert.equal((await act('freeGift', libro.id)).gifts[0].taken, 0);

  let admin = await act('moveGift', bici.id, { direction: 'up' });
  assert.deepEqual(admin.gifts.map((g) => g.title), ['Bici', 'Libro']);

  admin = await act('updateGift', libro.id, { title: 'Libro de cocina', price: '$15.000' });
  assert.equal(admin.gifts[1].title, 'Libro de cocina');

  await reserveGift(store, { id, giftId: bici.id, name: 'Ana' });
  await reserveGift(store, { id, giftId: bici.id, name: 'Beto' });
  await assert.rejects(act('updateGift', bici.id, { title: 'Bici', shared: false }), { status: 409 });

  admin = await act('deleteGift', bici.id);
  assert.deepEqual(admin.gifts.map((g) => g.title), ['Libro de cocina']);
});

test('rechaza links que no son web', async () => {
  const { add } = await setup();
  await assert.rejects(add({ title: 'x', link: 'javascript:alert(1)' }), { status: 400 });
});

// Imita la API REST de Supabase (PostgREST) sobre la tabla kv, para probar
// createSupabaseStore sin conexión a internet.
function fakeSupabase() {
  const rows = new Map();
  const requests = [];
  const parseIn = (v) => v.slice(4, -1).split(',').map((k) => JSON.parse(k));
  async function fetchImpl(url, { method, headers, body }) {
    requests.push({ url, method, headers });
    const u = new URL(url);
    assert.equal(u.pathname, '/rest/v1/kv');
    assert.equal(headers.apikey, 'sb_secret_test');
    const filter = u.searchParams.get('key');
    const keys = filter?.startsWith('eq.') ? [filter.slice(3)] : filter ? parseIn(filter) : [];
    const reply = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (method === 'GET') {
      const select = u.searchParams.get('select').split(',');
      return reply(keys.filter((k) => rows.has(k)).map((k) => Object.fromEntries(select.map((f) => [f, f === 'key' ? k : rows.get(k)]))));
    }
    if (method === 'POST') {
      const ignore = headers.Prefer.includes('resolution=ignore-duplicates');
      const inserted = [];
      for (const r of JSON.parse(body)) {
        if (ignore && rows.has(r.key)) continue;
        rows.set(r.key, r.value);
        inserted.push(r);
      }
      return reply(inserted);
    }
    if (method === 'DELETE') {
      for (const k of keys) rows.delete(k);
      return { ok: true, status: 204, text: async () => '' };
    }
    throw new Error(`método inesperado ${method}`);
  }
  return { fetchImpl, rows, requests };
}

test('la lista funciona completa sobre Supabase', async () => {
  const fake = fakeSupabase();
  const store = createSupabaseStore('https://abc.supabase.co', 'sb_secret_test', fake.fetchImpl);
  const { id, adminKey } = await createList(store, { ownerName: 'Román' });
  const act = (action, giftId, data) => adminAction(store, { id, key: adminKey, action, giftId, data });
  await act('addGift', null, { title: 'Libro' });
  const [libro, bici] = (await act('addGift', null, { title: 'Bici', shared: true })).gifts;

  await reserveGift(store, { id, giftId: libro.id, name: 'Ana' });
  await assert.rejects(reserveGift(store, { id, giftId: libro.id, name: 'Beto' }), { status: 409 });
  const beto = await reserveGift(store, { id, giftId: bici.id, name: 'Beto' });
  await reserveGift(store, { id, giftId: bici.id, name: 'Caro' });
  await assert.rejects(reserveGift(store, { id, giftId: bici.id, name: 'Dani' }), { status: 409 });

  let admin = await getAdminList(store, id, adminKey);
  assert.deepEqual(admin.gifts.map((g) => g.taken), [1, 2]);

  await releaseGift(store, { id, giftId: bici.id, ...beto });
  admin = await act('deleteGift', libro.id);
  assert.deepEqual(admin.gifts.map((g) => [g.title, g.taken]), [['Bici', 1]]);
  assert.equal([...fake.rows.keys()].filter((k) => k.startsWith('resv:')).length, 1);

  // Una clave nueva (sb_secret_) no se manda como JWT.
  assert.equal(fake.requests[0].headers.Authorization, undefined);
});

test('encuentra las credenciales de Supabase', () => {
  assert.deepEqual(findSupabaseCredentials({ SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SECRET_KEY: 'k' }), {
    url: 'https://x.supabase.co',
    key: 'k',
  });
  assert.deepEqual(
    findSupabaseCredentials({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJ' }),
    { url: 'https://x.supabase.co', key: 'eyJ' },
  );
  assert.equal(findSupabaseCredentials({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'a' }), null);
});
