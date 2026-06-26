// GET /api/load?u=dr-johnson
// Tries every place in order so a failure in one never loses the document:
//   primary (BOOK) → backup (BOOK_BACKUP) → newest snapshot.
// Returns {} only if truly nothing exists anywhere.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'dr-johnson').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'dr-johnson';
}
async function readJSON(ns, key) {
  try { const r = await ns.get(key); return r ? JSON.parse(r) : null; } catch (_) { return null; }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const id = cleanId(url.searchParams.get('u'));

  let data = null, source = null;

  if (env.BOOK) { data = await readJSON(env.BOOK, 'book:' + id); if (data) source = 'primary'; }
  if (!data && env.BOOK_BACKUP) { data = await readJSON(env.BOOK_BACKUP, 'book:' + id); if (data) source = 'backup'; }
  if (!data) {
    const ns = env.BOOK_BACKUP || env.BOOK;
    if (ns) {
      try {
        const list = await ns.list({ prefix: 'snap:' + id + ':' });
        const keys = list.keys.map(k => k.name).sort();
        if (keys.length) { data = await readJSON(ns, keys[keys.length - 1]); if (data) source = 'snapshot'; }
      } catch (_) {}
    }
  }

  if (!data) return json({});
  data._source = source;
  return json(data);
}
