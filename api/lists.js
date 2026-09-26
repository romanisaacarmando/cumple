import { createList } from '../lib/core.js';
import { handler } from '../lib/http.js';

// Crear una lista nueva. Devuelve el id y la clave de administración.
export default handler({
  POST: ({ store, body }) => createList(store, body),
});
