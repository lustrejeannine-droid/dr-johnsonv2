// POST /api/save
// Saves Coach Lloyd's work and AUTOMATICALLY COPIES IT to multiple independent
// places so nothing is ever lost:
//   1) Primary store    → KV namespace bound as BOOK
//   2) Backup store      → KV namespace bound as BOOK_BACKUP (the second place)
//   3) Snapshots         → point-in-time copies in the backup store (last 20)
//   4) OFF-SITE backup   → committed to a GitHub repo (different company entirely),
//                          giving an independent copy + automatic version history.
// Layers 2-4 are optional: connect what you want. With all of them on, the work
// survives even a full Cloudflare outage.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'coach-lloyd').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'coach-lloyd';
}
// UTF-8 + large-safe base64 (GitHub Contents API wants base64).
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

// Commit the backup JSON to a GitHub repo. Best-effort; never blocks the user.
async function pushToGitHub(env, id, payload) {
  const owner = env.GITHUB_OWNER, repo = env.GITHUB_REPO, token = env.GITHUB_TOKEN;
  if (!owner || !repo || !token) return; // off-site backup not configured, skip
  const branch = env.GITHUB_BRANCH || 'main';
  const path = 'backups/' + id + '.json';
  const api = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path;
  const headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'raising-happy-children-backup',
    'Content-Type': 'application/json'
  };
  try {
    // Need the existing file's sha to update it (absent on first push).
    let sha;
    const g = await fetch(api + '?ref=' + encodeURIComponent(branch), { headers });
    if (g.ok) { const gj = await g.json(); sha = gj.sha; }
    const body = { message: 'Backup ' + id + ' ' + new Date().toISOString(), content: toBase64(payload), branch };
    if (sha) body.sha = sha;
    await fetch(api, { method: 'PUT', headers, body: JSON.stringify(body) });
  } catch (_) { /* off-site backup is best-effort */ }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BOOK && !env.BOOK_BACKUP) {
    return json({ ok: false, error: 'No storage connected (KV namespace "BOOK").' }, 500);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'Bad request.' }, 400); }

  const id = cleanId(body && body.u);
  const record = {
    answers: (body && body.answers) || {},
    bookGoal: (body && body.bookGoal) || '',
    voiceSample: (body && body.voiceSample) || '',
    draft: (body && body.draft) || '',
    updatedAt: new Date().toISOString()
  };
  const payload = JSON.stringify(record);

  // 1 + 2: write the live copy to every connected store.
  const stores = [['primary', env.BOOK], ['backup', env.BOOK_BACKUP]].filter(s => s[1]);
  const wrote = {};
  for (const [name, ns] of stores) {
    try { await ns.put('book:' + id, payload); wrote[name] = true; }
    catch (_) { wrote[name] = false; }
  }

  const snapStore = env.BOOK_BACKUP || env.BOOK;
  const now = Date.now();

  // 3: throttled point-in-time snapshot (at most one per 30 min, keep last 20).
  try {
    let last = 0;
    try { const ls = await snapStore.get('lastsnap:' + id); if (ls) last = parseInt(ls, 10) || 0; } catch (_) {}
    if (now - last > 30 * 60 * 1000) {
      const ts = new Date(now).toISOString();
      await snapStore.put('snap:' + id + ':' + ts, payload);
      await snapStore.put('lastsnap:' + id, String(now));
      const list = await snapStore.list({ prefix: 'snap:' + id + ':' });
      const keys = list.keys.map(k => k.name).sort();
      if (keys.length > 20) for (const name of keys.slice(0, keys.length - 20)) { try { await snapStore.delete(name); } catch (_) {} }
    }
  } catch (_) {}

  // 4: throttled OFF-SITE backup to GitHub (at most one push per 10 min), run
  // AFTER responding so it never slows down saving.
  let pushedOffsite = false;
  if (env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO) {
    try {
      let lastgh = 0;
      try { const lg = await snapStore.get('lastgh:' + id); if (lg) lastgh = parseInt(lg, 10) || 0; } catch (_) {}
      if (now - lastgh > 10 * 60 * 1000) {
        await snapStore.put('lastgh:' + id, String(now));
        pushedOffsite = true;
        if (context.waitUntil) context.waitUntil(pushToGitHub(env, id, payload));
        else await pushToGitHub(env, id, payload);
      }
    } catch (_) {}
  }

  return json({ ok: true, savedAt: record.updatedAt, copies: wrote, offsiteQueued: pushedOffsite });
}
