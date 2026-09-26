import { reserveGift } from '../lib/core.js';
import { handler } from '../lib/http.js';

// Un amigo reserva un regalo. Devuelve un token para poder liberarlo después.
export default handler({
  POST: ({ store, body }) => reserveGift(store, body),
});
