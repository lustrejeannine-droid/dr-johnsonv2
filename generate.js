// POST /api/generate
// FREE book generation using Cloudflare Workers AI (no API key, no card, no
// subscription — included in the free Cloudflare plan). The finished draft is
// saved to BOTH the primary and backup stores.
//
// Want top-quality Claude writing instead? See the commented block at the bottom
// — it's a one-function swap (you'd add an ANTHROPIC_API_KEY secret).

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'dr-johnson').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'dr-johnson';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return json({ error: 'The free AI (Workers AI binding "AI") is not connected yet. Add it in project settings.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const prompt = (body && body.prompt) ? String(body.prompt) : '';
  if (!prompt) return json({ error: 'No prompt provided.' }, 400);

  let text = '';
  try {
    const out = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: 'You are a warm, experienced ghostwriter helping a 97-year-old write a heartfelt parenting book in his own gentle, pastoral voice. Write naturally, like a grandfather sharing hard-won wisdom.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 4096
    });
    text = (out && (out.response || out.result || '')) || '';
  } catch (e) {
    return json({ error: 'The free writing service could not be reached. His notes are safe — please try again.' }, 502);
  }

  if (!text.trim()) {
    return json({ error: 'No text was returned. His notes are safe — please try again.' }, 502);
  }

  // Fold the draft into the saved record, in BOTH primary and backup stores.
  const id = cleanId(body && body.u);
  const stores = [env.BOOK, env.BOOK_BACKUP].filter(Boolean);
  for (const ns of stores) {
    try {
      const existingRaw = await ns.get('book:' + id);
      const existing = existingRaw ? JSON.parse(existingRaw) : {};
      existing.draft = text;
      existing.updatedAt = new Date().toISOString();
      await ns.put('book:' + id, JSON.stringify(existing));
    } catch (_) { /* best-effort; the client also saves */ }
  }

  return json({ text });
}

/* ──────────────────────────────────────────────────────────────────────────
   TO USE CLAUDE INSTEAD (paid, ~a few cents per book, best writing):
   1) Add a secret named ANTHROPIC_API_KEY in project settings.
   2) Replace the env.AI.run(...) block above with:

      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 16000,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await apiRes.json();
      text = (data.content || []).map(b => b.text || '').join('');
   ────────────────────────────────────────────────────────────────────────── */
