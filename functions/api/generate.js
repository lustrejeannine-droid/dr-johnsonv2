// POST /api/generate
// FREE book generation using Cloudflare Workers AI (no API key, no card).
// Uses current (2026) models with automatic fallback, and reads the response in
// whatever shape the model returns. Saves the draft to BOTH stores.

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}
function cleanId(u) {
  return (u || 'coach-lloyd').toString().replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'coach-lloyd';
}

// Current Workers AI models (older Llama 3.x were deprecated 2026-05-30).
const MODELS = [
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/zai-org/glm-4.7-flash',
  '@cf/google/gemma-4-26b-a4b-it'
];

// Different models return text in different shapes, handle them all.
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
    "You are the ghostwriter for Coach Steven Lloyd, founder and CEO of Hero Pro Tools and Sterling & Pope, a strategic growth coach who helps people and business owners take control and win. You are helping him write his personal-development book \"One Day to the Best Version of You!\" Write everything in HIS established voice, the voice of his book \"The 7 Secrets of Google First Page Domination.\"",
    "",
    "VOICE & TONE: Confident, direct, motivating, and empowering, like a coach who has helped many people and knows the path works. Second person throughout, speaking straight to the reader (\"you,\" \"your\"). Optimistic and momentum-driven. He believes change can start with a single decision, made today. He pushes the reader to stop waiting, stop relying on luck, and take control. Warm but no-nonsense.",
    "",
    "HOW HE TEACHES: Through real-life STORIES and concrete examples, one vivid story or example carries each point, followed by the plain, practical lesson and a clear action the reader can take right now. He validates where the reader is stuck first (\"If you are like most people, you have probably tried... You are not alone.\"), then hands them a proven path. He loves named, capitalized frameworks, systems, and methods (for example the kind of branded step-by-step systems he built at Hero Pro Tools), and he is relentlessly practical, never theoretical.",
    "",
    "SIGNATURE MOVES: Contrast and reframe (\"It is not about X. It is about Y.\"). Rhetorical questions that pull the reader in (\"But why does this matter so much?\"). Setup lines like \"Here is the best part:\" and \"Here is what most people miss:\". Promise-of-outcome framing (\"By the time you finish this chapter, you will...\"). Light, rhythmic repetition for emphasis (\"every day, every choice, every decision\"). Occasional well-placed exclamation for energy.",
    "",
    "IDEAS HE RETURNS TO: transformation starts with one decision; identity drives behavior (decide who you are first); clarity of vision creates momentum; winning the inner game and rewriting limiting self-talk; small daily habits that compound into a new person; pushing through obstacles and excuses; designing the people and environment around you; taking action before you feel ready; consistency over intensity; becoming your best self and then lifting others. Practical, actionable, accessible to anyone, even if they are not 'naturally' disciplined.",
    "",
    "LANGUAGE: Simple, clear, and direct. If a term might be unfamiliar, explain it in plain words immediately. Short, punchy sentences mixed with longer ones for rhythm. NEVER use em dashes anywhere. Use periods, commas, or colons instead. Never preachy, never clinical, never academic. Active voice. Speak like a coach who genuinely believes in the reader."
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

  // Strip any em dashes the model may still produce (Coach Lloyd's standing rule).
  text = text.replace(/\s*\u2014\s*/g, ', ');

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
