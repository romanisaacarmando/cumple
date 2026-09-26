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
import { createMemoryStore } from '../lib/store.js';

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

test('encuentra las credenciales de Upstash con o sin prefijo', async () => {
  const { findRedisCredentials } = await import('../lib/store.js');
  assert.deepEqual(findRedisCredentials({ KV_REST_API_URL: 'u', KV_REST_API_TOKEN: 't' }), { url: 'u', token: 't' });
  assert.deepEqual(
    findRedisCredentials({ STORAGE_KV_REST_API_URL: 'u', STORAGE_KV_REST_API_TOKEN: 't', STORAGE_KV_REST_API_READ_ONLY_TOKEN: 'r' }),
    { url: 'u', token: 't' },
  );
  assert.deepEqual(findRedisCredentials({ UPSTASH_REDIS_REST_URL: 'u', UPSTASH_REDIS_REST_TOKEN: 't' }), { url: 'u', token: 't' });
  assert.equal(findRedisCredentials({ KV_URL: 'redis://x', REDIS_URL: 'redis://x' }), null);
});
