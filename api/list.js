import { getPublicList } from '../lib/core.js';
import { handler } from '../lib/http.js';

// Lista vista por los amigos.
export default handler({
  GET: ({ store, query }) => getPublicList(store, query.id),
});
