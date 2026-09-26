import { releaseGift } from '../lib/core.js';
import { handler } from '../lib/http.js';

// Un amigo libera un regalo que había reservado.
export default handler({
  POST: ({ store, body }) => releaseGift(store, body),
});
