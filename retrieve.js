// GET /api/retrieve?u=dr-johnson            → live record + list of snapshot times
// GET /api/retrieve?u=dr-johnson&snap=KEY   → the full data of one snapshot
// Powers the backup/retrieval page (backup.html). This is the human "path to
// retrieve" everything, independent of the main writing app.

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
  const snap = url.searchParams.get('snap');
  const snapStore = env.BOOK_BACKUP || env.BOOK;

  if (!env.BOOK && !env.BOOK_BACKUP) return json({ error: 'No storage connected.' }, 500);

  // Fetch a specific snapshot.
  if (snap) {
    if (!/^snap:[a-z0-9-_]+:/i.test(snap)) return json({ error: 'Bad snapshot key.' }, 400);
    const data = snapStore ? await readJSON(snapStore, snap) : null;
    return json({ snap, data: data || null });
  }

  // Live record (with failover) + snapshot index.
  let live = null, source = null;
  if (env.BOOK) { live = await readJSON(env.BOOK, 'book:' + id); if (live) source = 'primary'; }
  if (!live && env.BOOK_BACKUP) { live = await readJSON(env.BOOK_BACKUP, 'book:' + id); if (live) source = 'backup'; }

  let snapshots = [];
  if (snapStore) {
    try {
      const list = await snapStore.list({ prefix: 'snap:' + id + ':' });
      snapshots = list.keys.map(k => ({ key: k.name, ts: k.name.split(':').slice(2).join(':') })).sort((a, b) => b.ts.localeCompare(a.ts));
    } catch (_) {}
  }

  // Off-site (GitHub) backup status, if configured.
  let offsite = null;
  const ghOn = !!(env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO);
  if (ghOn) {
    let lastPushed = null;
    if (snapStore) { try { const lg = await snapStore.get('lastgh:' + id); if (lg) lastPushed = new Date(parseInt(lg, 10)).toISOString(); } catch (_) {} }
    offsite = {
      github: true,
      repo: env.GITHUB_OWNER + '/' + env.GITHUB_REPO,
      path: 'backups/' + id + '.json',
      lastPushed
    };
  }

  return json({
    user: id,
    source,
    live,
    snapshots,
    stores: { primary: !!env.BOOK, backup: !!env.BOOK_BACKUP },
    offsite,
    serverTime: new Date().toISOString()
  });
}
