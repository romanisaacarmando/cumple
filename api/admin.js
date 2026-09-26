import { adminAction, getAdminList } from '../lib/core.js';
import { handler } from '../lib/http.js';

// Panel del cumpleañero. La clave viaja en el header x-admin-key.
export default handler({
  GET: ({ store, query, headers }) => getAdminList(store, query.id, headers['x-admin-key']),
  POST: ({ store, body, headers }) => adminAction(store, { ...body, key: headers['x-admin-key'] }),
});
