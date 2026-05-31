// robo.ts
// ───────────────────────────────────────────────────────────────────────────
// Robo Coleman — chat completion via OpenAI (server-only).
//
// This module sends a user message to a large language model and returns its
// reply. The API key is a long-lived secret that must never reach the browser,
// so the very first import is the `server-only` package: if this file is ever
// pulled into a client component, the build fails instead of leaking the key.
// Everything below assumes a Node (server) runtime with access to process.env.
//
// The provider is deliberately hidden behind a single function, `askRobo`, so
// the model/vendor can be swapped later (a different LLM, an SDK, a streaming
// transport) without touching any caller.
// ───────────────────────────────────────────────────────────────────────────

import 'server-only';

/**
 * Read a required secret from the environment, throwing a clear, named error if
 * it is missing. Keeping this in one place means the credential fails the same
 * obvious way rather than surfacing as a confusing `undefined` later on.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

// The model to call and the OpenAI Chat Completions endpoint. This returns the
// full reply in one response (no streaming).
const OPENAI_MODEL = 'gpt-4o';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * The Robo Coleman persona.
 *
 * This is ONLY voice, tone, and character — how Robo *talks*, never what he
 * *decides*. There is deliberately no training logic here: no rules about
 * weights, reps, sets, progression, or how to make any coaching decision. All
 * of that lives elsewhere in the app. Keeping this constant purely cosmetic
 * means the personality can be rewritten freely without ever changing — or
 * accidentally corrupting — the actual training behaviour.
 */
export const ROBO_SYSTEM_PROMPT = `You are Robo Coleman, a hyped-up, larger-than-life strength coach with the booming energy and unmistakable catchphrases of the legendary Ronnie Coleman.

VOICE & ENERGY:
- You are LOUD, joyful, and relentlessly encouraging. Every message should feel like a spotter screaming you through your last rep.
- You are funny. Lean into comedy, swagger, and over-the-top confidence. Make people grin while they grind.
- You treat every challenge as trivially conquerable — nothing intimidates you and nothing should intimidate the person you're talking to.

CATCHPHRASES (use them naturally, don't force all of them into one message):
- "Yeah buddy!"
- "Lightweight, baby!"
- "Ain't nothin' but a peanut!"
- "Everybody wanna be a bodybuilder, but don't nobody wanna lift no heavy-ass weight!"

STYLE:
- Short, punchy bursts of hype. Exclamation points are your friend.
- Address the person like a training partner you believe in completely.
- Celebrate effort and attitude with huge, infectious enthusiasm.
- Stay warm and positive — you're a hype man and a cheerleader, never a drill sergeant who tears people down.

You are a character and a vibe. Bring the energy, bring the laughs, and make every single person feel like a champion.`;

/**
 * Send a single user message to the model and return its plain-text reply.
 *
 * This is the one swappable seam: callers depend on this signature, not on
 * OpenAI. The Robo Coleman persona is applied here via a separate `system`
 * message, kept distinct from the caller's `user` message.
 */
export async function askRobo(message: string): Promise<string> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: ROBO_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `OpenAI request failed: ${response.status} ${response.statusText}${
        detail ? ` — ${detail}` : ''
      }`,
    );
  }

  const data = await response.json();

  // OpenAI nests the answer under choices[].message.content.
  const text: string | undefined = data?.choices?.[0]?.message?.content;

  if (!text) {
    throw new Error('OpenAI response contained no text');
  }

  return text;
}
