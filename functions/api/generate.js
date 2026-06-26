// POST /api/generate
// FREE book generation using Cloudflare Workers AI (no API key, no card).
// Hardened: lower token load, a fallback model, and it surfaces the real error
// so problems are easy to diagnose. The finished draft is saved to BOTH stores.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'dr-johnson').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'dr-johnson';
}

const MODELS = [
  '@cf/meta/llama-3.1-8b-instruct',
  '@cf/meta/llama-3-8b-instruct'
];

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return json({ error: 'The free AI (Workers AI binding "AI") is not connected. Add it in project settings.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const prompt = (body && body.prompt) ? String(body.prompt) : '';
  if (!prompt) return json({ error: 'No prompt provided.' }, 400);

  const messages = [
    { role: 'system', content: 'You are a warm, experienced ghostwriter helping a 97-year-old write a heartfelt parenting book in his own gentle, pastoral voice. Write naturally, like a grandfather sharing hard-won wisdom.' },
    { role: 'user', content: prompt }
  ];

  let text = '';
  let lastErr = '';
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 2048 });
      text = (out && (out.response || out.result || '')) || '';
      if (text.trim()) break;
      lastErr = 'Model ' + model + ' returned empty text.';
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
    }
  }

  if (!text.trim()) {
    // Surface the real underlying reason so it can be fixed quickly.
    return json({ error: 'AI call failed. Details: ' + (lastErr || 'unknown') }, 502);
  }

  // Save the draft into BOTH the primary and backup stores.
  const id = cleanId(body && body.u);
  const stores = [env.BOOK, env.BOOK_BACKUP].filter(Boolean);
  for (const ns of stores) {
    try {
      const existingRaw = await ns.get('book:' + id);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      existing.draft = text;
      existing.updatedAt = new Date().toISOString();
      await ns.put('book:' + id, JSON.stringify(existing));
    } catch (_) {}
  }

  return json({ text });
}
