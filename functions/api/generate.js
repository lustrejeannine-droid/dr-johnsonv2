// POST /api/generate
// FREE book generation using Cloudflare Workers AI (no API key, no card).
// Uses current (2026) models with automatic fallback, and reads the response in
// whatever shape the model returns. Saves the draft to BOTH stores.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'dr-johnson').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'dr-johnson';
}

// Current Workers AI models (older Llama 3.x were deprecated 2026-05-30).
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/google/gemma-4-26b-a4b-it'
];

// Different models return text in different shapes — handle them all.
function extractText(out) {
  if (!out) return '';
  if (typeof out === 'string') return out;
  if (out.response) return out.response;
  if (out.result && out.result.response) return out.result.response;
  if (out.choices && out.choices[0]) {
    const c = out.choices[0];
    if (c.message && c.message.content) return c.message.content;
    if (c.text) return c.text;
  }
  if (out.output_text) return out.output_text;
  return '';
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return json({ error: 'The free AI (Workers AI binding "AI") is not connected. Add it in project settings.' }, 500);
  }

  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'Bad request.' }, 400); }

  const prompt = (body && body.prompt) ? String(body.prompt) : '';
  if (!prompt) return json({ error: 'No prompt provided.' }, 400);

  const SYSTEM_VOICE = [
    "You are the ghostwriter for Dr. Grant W. Johnson, a 97-year-old psychologist, former eighth-grade teacher, and counselor of more than 50 years, helping him write a warm parenting book. Write everything in HIS established voice, the voice of his book \"Common Sense Psychology for Everyday Living.\"",
    "",
    "VOICE & TONE: Warm, folksy, plain-spoken, and encouraging — a wise grandfather sharing hard-won common sense, never clinical or academic. First person (\"I,\" \"we,\" \"us\"), speaking directly to the reader (\"you\"). Optimistic, gentle, gracious, with light self-deprecating humor.",
    "",
    "HOW HE TEACHES: Through real-life STORIES and anecdotes from his decades of counseling and teaching — one vivid story carries each lesson, followed by the plain point it proves. He loves memorable one-liners and homespun aphorisms, and often quotes his wise, uneducated father (for example, \"Never do for a child what the child can do for himself\").",
    "",
    "IDEAS HE RETURNS TO: natural and logical consequences; that what matters most is \"What do I say to myself about myself?\"; the \"inner critic\"; respecting a child only as well as you respect yourself; being firm and loving like an oak tree — \"say what you mean and mean what you say\"; reasonable boundaries give children safety and reduce anxiety; discipline means teaching, not punishment; encouragement (a child learns best succeeding about 80% of the time and challenged the other 20%); parents presenting a united front; putting the marriage first. He affectionately calls ordinary people \"Garden Variety Nuts.\" He occasionally quotes Thoreau (\"Simplify\"), Lincoln, Pogo, scripture, and old proverbs — always in service of plain common sense.",
    "",
    "LANGUAGE: Simple and timeless. If a technical term slips in (like \"cognitive dissonance\"), he immediately explains it in everyday words. Short, rhythmic sentences; occasional rhetorical questions and gentle exclamations. Never trendy, never harsh, never preachy."
  ].join("\n");

  const messages = [
    { role: 'system', content: SYSTEM_VOICE },
    { role: 'user', content: prompt }
  ];

  let text = '';
  let lastErr = '';
  for (const model of MODELS) {
    try {
      const out = await env.AI.run(model, { messages, max_tokens: 2048 });
      text = (extractText(out) || '').trim();
      if (text) break;
      lastErr = 'Model ' + model + ' returned empty text.';
    } catch (e) {
      lastErr = (e && e.message) ? e.message : String(e);
    }
  }

  if (!text) {
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
