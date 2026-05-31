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

import { formatMemoriesForContext } from '@/lib/memory';
import { z } from 'zod';

import { exerciseSchema, type Exercise } from '@/lib/exercise-schema';
import { getExercisesFromDb } from '@/lib/exercises-db';

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

/**
 * Instruction for proposing a brand-new exercise definition as strict JSON.
 *
 * This is a SHAPE contract, not a persona: it tells the model exactly which
 * fields to emit and forbids any prose, markdown, or invented weight. The model
 * is only allowed to describe the *movement* (its mechanics and progression
 * style) — never how heavy it should be. The starting weight is an empirical
 * fact discovered by the lifter's first logged set, so the model is explicitly
 * barred from guessing it. Pairing this JSON-only instruction with a Zod
 * safeParse on the way back gives a hard boundary: anything that isn't a valid
 * Exercise shape is rejected rather than trusted.
 */
const PROPOSE_EXERCISE_INSTRUCTION = `You define strength-training exercises as strict JSON for an app. Given a movement name (and an optional hint), output a single JSON object describing that exercise.

Return a JSON object with EXACTLY these fields:
- "id": a lowercase kebab-case string derived from the name (e.g. "Incline Dumbbell Press" -> "incline-dumbbell-press"). Letters, digits, and hyphens only.
- "name": the human-readable movement name as a string.
- "type": one of "barbell", "dumbbell", "plate-loaded", "pin-machine".
- "scope": one of "universal" (available in any gym) or "home-only".
- "repRange": an object { "min": <integer>, "max": <integer> } with min <= max.
- "increment": a discriminated-union object whose "kind" matches the type of loading. Use EXACTLY one of:
    - { "kind": "barbell", "perSideKg": <number> }      // smallest plate added PER SIDE of the bar
    - { "kind": "dumbbell-pair" }                          // no extra fields
    - { "kind": "plate", "smallestPlateKg": <number> }    // smallest single plate available
    - { "kind": "pin", "observedStepsKg": [<number>, ...] } // OPTIONAL; omit it entirely if unknown — do NOT invent values
  Choose the "kind" that fits the loading mechanism (typically: barbell->barbell, dumbbell->dumbbell-pair, plate-loaded->plate, pin-machine->pin).
- "unit": one of "total", "per-side", "per-hand", "stack" — how the logged weight is expressed for this movement.
- "notes": OPTIONAL short string; omit it if you have nothing useful to add.

CRITICAL RULES:
- Do NOT include a working weight, baselineKg, current weight, or any starting load. The weight is determined later from the lifter's first logged set — NOT by you. Never invent or guess it.
- Return ONLY the raw JSON object. No prose, no explanation, no markdown, no code fences. The first character of your reply must be "{" and the last must be "}".`;

/**
 * Ask the model to propose a brand-new {@link Exercise} definition as JSON.
 *
 * Unlike the chat functions above, this call has nothing to do with the Robo
 * persona — it uses the same provider seam (the OpenAI Chat Completions
 * endpoint) purely as a structured-output generator. The model proposes the
 * exercise's *shape and progression style*; it is explicitly forbidden from
 * inventing the working weight, which is discovered later from logging.
 *
 * Reliability comes from two cooperating halves:
 *   1. The instruction demands JSON-only output (no prose/markdown).
 *   2. The reply is run through `exerciseSchema.safeParse`, so a wrong shape is
 *      rejected with a formatted error instead of flowing downstream.
 *
 * Returns a discriminated result: `{ ok: true, exercise }` on success, or
 * `{ ok: false, error }` when parsing or validation fails.
 */
export async function proposeExercise(
  name: string,
  hint?: string,
): Promise<
  { ok: true; exercise: Exercise } | { ok: false; error: string }
> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  // The user turn carries only the raw inputs; all shape/contract lives in the
  // system instruction so the model can't mistake guidance for data.
  const userContent = hint
    ? `Movement name: ${name}\nHint: ${hint}`
    : `Movement name: ${name}`;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: PROPOSE_EXERCISE_INSTRUCTION },
        { role: 'user', content: userContent },
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

  // First boundary: the text must actually be JSON. A model that returns prose
  // or fenced markdown despite the instruction trips here and is rejected.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: `Model did not return valid JSON: ${text}`,
    };
  }

  // Second boundary: the JSON must match the Exercise shape. We validate
  // against the schema with `baselineKg` OMITTED, because the model is
  // explicitly forbidden from supplying a weight — validating against the full
  // schema would require a field we told the model never to send, so a correct
  // proposal could never pass. safeParse never throws: a bad shape comes back
  // as a structured error we can surface.
  const result = exerciseSchema.omit({ baselineKg: true }).safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      // Human-readable, field-by-field account of what failed validation.
      error: z.prettifyError(result.error),
    };
  }

  // The full Exercise shape requires baselineKg, so we stamp in 0 as a
  // placeholder here. The real starting weight is set later from the lifter's
  // first logged set, never by the model.
  return { ok: true, exercise: { ...result.data, baselineKg: 0 } };
}

/**
 * Zod schema for a model-proposed training plan.
 *
 * This is a deliberately NARROW shape. Each item references an exercise by id
 * and carries integer set/rep targets — and NOTHING else. There is no weight
 * field anywhere, by design (see {@link ProposedPlan}): the loading is the
 * engine's job, not the model's.
 *
 * Note this validates *structure only*. It can confirm `exerciseId` is a
 * string, but it has no idea whether that string names a real exercise — that
 * second, semantic check is done separately against the fetched catalog.
 */
const proposedPlanSchema = z.object({
  name: z.string(),
  note: z.string().optional(),
  items: z
    .array(
      z.object({
        exerciseId: z.string(),
        targetSets: z.number().int(),
        targetRepMin: z.number().int(),
        targetRepMax: z.number().int(),
      }),
    )
    .min(1),
});

/**
 * A training plan proposed by the model.
 *
 * Note the conspicuous ABSENCE of any weight field — on the plan, on the items,
 * anywhere. This is deliberate. The model picks the *movements* and the
 * *set/rep targets* (the qualitative skeleton of a session); the actual load for
 * each exercise is computed by the engine from the lifter's logged history, the
 * exercise's increment rule, and its baseline. Letting the model emit a weight
 * would invite invented numbers into a place the app treats as authoritative —
 * exactly the boundary the rest of this module works to enforce.
 */
export type ProposedPlan = z.infer<typeof proposedPlanSchema>;

/**
 * Build the system instruction for {@link proposePlan}.
 *
 * The allowed-exercise list is injected as data: the model may ONLY choose from
 * these ids, and is told so explicitly. Like {@link PROPOSE_EXERCISE_INSTRUCTION}
 * this is a pure shape contract (JSON only, no prose) and it hard-forbids any
 * weight — the engine, not the model, decides load.
 */
function buildProposePlanInstruction(exercises: Exercise[]): string {
  // Hand the model only what it needs to choose sensibly: the id it must
  // reference, the human name, the loading type, and the exercise's own rep
  // range as guidance. Crucially NOT the weight/baseline — that's not its call.
  const allowed = exercises
    .map(
      (e) =>
        `- id: "${e.id}" | name: "${e.name}" | type: ${e.type} | repRange: ${e.repRange.min}-${e.repRange.max}`,
    )
    .join('\n');

  return `You design strength-training plans as strict JSON for an app. You will be given the user's request and a fixed list of the ONLY exercises you may use.

ALLOWED EXERCISES (choose exclusively from these — every item's "exerciseId" MUST be one of these ids, copied exactly):
${allowed}

Return a single JSON object with EXACTLY these fields:
- "name": a short human-readable name for the plan, as a string.
- "note": OPTIONAL short string with any useful context; omit it entirely if you have nothing to add.
- "items": a non-empty array of objects, each with EXACTLY:
    - "exerciseId": a string that is one of the allowed ids above, copied verbatim. Do NOT invent ids or use names.
    - "targetSets": an integer number of sets.
    - "targetRepMin": an integer, the bottom of the target rep range for that exercise.
    - "targetRepMax": an integer, the top of the target rep range (>= targetRepMin).

CRITICAL RULES:
- Do NOT include any weight, load, kg, baselineKg, or starting weight anywhere — not on the plan, not on any item. Weights are determined SEPARATELY by the engine, never by you. Adding a weight is an error.
- Every "exerciseId" MUST appear in the allowed list above. Never reference an exercise that is not listed.
- Return ONLY the raw JSON object. No prose, no explanation, no markdown, no code fences. The first character of your reply must be "{" and the last must be "}".`;
}

/**
 * Ask the model to propose a training plan, constrained to real exercises.
 *
 * The model is given the user's free-text `request` plus the live exercise
 * catalog (ids, names, types, rep ranges) fetched via `getExercisesFromDb`, and
 * told those are the only exercises it may use. It returns a {@link ProposedPlan}
 * — movements and set/rep targets only, deliberately with NO weights (load is
 * the engine's responsibility).
 *
 * Reliability comes from THREE cooperating checks:
 *   1. The instruction demands JSON-only output (no prose/markdown).
 *   2. `proposedPlanSchema.safeParse` rejects anything that isn't the right shape.
 *   3. Every `exerciseId` is verified to exist in the fetched catalog — Zod can
 *      confirm the field is a string, but not that it names a real exercise.
 *
 * Returns `{ ok: true, plan }` on success, or `{ ok: false, error }` if the
 * model returns non-JSON, the wrong shape, or references an unknown exercise.
 */
export async function proposePlan(
  request: string,
): Promise<{ ok: true; plan: ProposedPlan } | { ok: false; error: string }> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  // The catalog is both the menu the model chooses from and the allowlist we
  // validate its choices against afterwards — one source for both halves.
  const exercises = await getExercisesFromDb();

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: buildProposePlanInstruction(exercises) },
        { role: 'user', content: request },
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

  // First boundary: the reply must actually be JSON.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: `Model did not return valid JSON: ${text}`,
    };
  }

  // Second boundary: the JSON must match the ProposedPlan shape. safeParse
  // never throws — a bad shape comes back as a structured error we surface.
  const result = proposedPlanSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: z.prettifyError(result.error),
    };
  }

  // Third boundary (semantic, not structural): every referenced exerciseId must
  // name a real exercise. Zod validated that exerciseId is a string, but a
  // syntactically perfect plan can still cite a movement that doesn't exist —
  // the model can hallucinate a plausible-looking id. We reject any unknown id
  // against the catalog we just fetched.
  const knownIds = new Set(exercises.map((e) => e.id));
  const unknown = result.data.items
    .map((item) => item.exerciseId)
    .filter((id) => !knownIds.has(id));

  if (unknown.length > 0) {
    const unique = [...new Set(unknown)];
    return {
      ok: false,
      error: `Plan references unknown exercise id(s): ${unique
        .map((id) => `"${id}"`)
        .join(', ')}. Allowed ids: ${exercises
        .map((e) => `"${e.id}"`)
        .join(', ')}.`,
    };
  }

  return { ok: true, plan: result.data };
}

/**
 * Grounding rules for context-backed replies.
 *
 * This is the firewall between Robo's *mouth* and the app's *brain*. The
 * persona controls how he talks; these rules control his relationship to the
 * numbers. They forbid him from doing any arithmetic or invention of his own:
 * every weight, rep, and training decision must come verbatim from the
 * supplied context, which the engine — not the model — computed. Robo is a
 * narrator of facts here, never their author.
 */
export const ROBO_CONTEXT_RULES = `IMPORTANT — HOW TO USE THE CONTEXT:
The CONTEXT section below contains authoritative, pre-computed facts about this lifter's training. Treat it as the single source of truth.

- Every number in the context — weights, reps, sets, RPE, percentages, any training decision — is a FACT that has already been calculated for you. Report these numbers exactly as written.
- You must NEVER invent, change, round, recalculate, or estimate any number. Do not do arithmetic of your own. If a number is not in the context, do not make one up — instead say you don't have it.
- You must NEVER contradict or alter anything stated in the context. If the context says lift 100kg for 5 reps, you say 100kg for 5 reps — with maximum hype, but never a different number.
- Your job is to NARRATE and CELEBRATE the facts in the context in your voice. The facts come from the context; the energy comes from you.`;

/**
 * Rules for the lifter's long-term memory section.
 *
 * Memories are durable, qualitative facts about the *person* (injuries, goals,
 * preferences) — not the per-question training numbers. They exist to shape
 * Robo's awareness and tone: a noted shoulder injury should make him mindful
 * and considerate, a stated goal should let him cheer toward it. Crucially,
 * memory is NOT a source of training prescriptions. The hard line from
 * {@link ROBO_CONTEXT_RULES} still governs every number: those come only from
 * the engine's CONTEXT, and memory may never introduce, change, or override
 * any weight, rep, set, or training decision.
 */
export const ROBO_MEMORY_RULES = `ABOUT THE LIFTER (long-term memory):
The section below holds durable background facts about this person — things like injuries, goals, and preferences — remembered across conversations. They are NOT this session's training plan.

- Use these facts to shape your awareness, tone, and encouragement. If a memory notes an injury, be mindful of it and supportive about it; if it notes a goal, cheer them toward it.
- These are background colour about the person, NOT a source of training numbers. They never contain a prescription for today.
- The number rules above still apply without exception: every weight, rep, set, and training decision comes ONLY from the engine CONTEXT below. Memory must never add, change, override, or contradict any of those numbers. If memory and the engine context ever seem to disagree about what to do today, the engine context wins — always.`;

/**
 * Like {@link askRobo}, but grounds the reply in authoritative `context`.
 *
 * The same persona drives the voice, but the system message is extended with
 * strict fact-grounding rules and a clearly-labelled CONTEXT section holding
 * the engine-computed numbers. Robo must narrate those numbers exactly and is
 * explicitly forbidden from inventing or recalculating any of them.
 */
export async function askRoboWithContext(
  message: string,
  context: string,
): Promise<string> {
  const apiKey = requireEnv('OPENAI_API_KEY');

  // Durable background facts about the lifter (injuries, goals, preferences),
  // loaded fresh each call. Distinct from the per-question engine `context`:
  // memory shapes awareness and tone, never the numbers. Empty string when the
  // lifter has no stored memories, in which case we omit the section entirely.
  const memories = await formatMemoriesForContext();

  // Two clearly-labelled, non-overlapping fact sections:
  //   • ABOUT THE LIFTER — durable, qualitative memory (only if present).
  //   • CONTEXT — this session's authoritative, engine-computed numbers.
  // The rule blocks before each section spell out how Robo must treat it, and
  // the memory rules explicitly defer to the engine context on any number.
  const memorySection = memories
    ? `${ROBO_MEMORY_RULES}

ABOUT THE LIFTER (durable background facts — inform tone, never a source of numbers):
${memories}

`
    : '';

  // Persona (how he talks) + grounding rules (how he must treat numbers) +
  // optional memory (who the lifter is) + the authoritative facts themselves,
  // fenced off as a labelled section.
  const systemContent = `${ROBO_SYSTEM_PROMPT}

${ROBO_CONTEXT_RULES}

${memorySection}CONTEXT (authoritative facts — report exactly, never alter):
${context}`;

  const response = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: systemContent },
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
