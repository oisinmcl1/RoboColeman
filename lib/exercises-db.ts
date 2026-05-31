// exercises-db.ts
// ───────────────────────────────────────────────────────────────────────────
// Read the exercise catalog from the DATABASE instead of the in-code BASELINE.
//
// This is a NEW path that sits alongside lib/baseline.ts — it does not replace
// it. The DB stores a flattened row (repRange split into two Int columns, the
// increment kept whole as an opaque JSON column). On the way out we reassemble
// the nested shape and run every row through exerciseSchema, so the values that
// leave this module are the exact same trusted, fully-typed Exercise the rest
// of the app already knows.
//
// Server-only: this reaches the Prisma client (DB credentials + pool). The
// guard turns an accidental client-component import into a build error rather
// than a runtime secret leak. (see lib/prisma.ts / lib/memory.ts for the same
// belt-and-braces pattern.)
// ───────────────────────────────────────────────────────────────────────────

import 'server-only';

import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { exerciseSchema, type Exercise } from '@/lib/exercise-schema';

/**
 * All exercises from the DB, validated and typed.
 *
 * The DB column layout differs from the Exercise shape in two places:
 *   - repRangeMin / repRangeMax  →  folded back into a `repRange` object
 *   - increment (Json column)    →  passed straight through; Zod's discriminated
 *                                   union re-checks its `kind` and payload
 *
 * Each candidate is run through `exerciseSchema.parse`, so anything returned is
 * a genuine Exercise — not just whatever bytes happened to be in the row.
 * A row that fails validation throws a located error rather than silently
 * yielding a malformed object downstream.
 */
export async function getExercisesFromDb(): Promise<Exercise[]> {
  const rows = await prisma.exercise.findMany();

  return rows.map((row) => {
    // Reassemble the nested shape the Zod schema expects. The `increment` JSON
    // is handed over untouched — it is exactly the discriminated-union object
    // that was stored, and Zod is what decides whether it's still valid.
    const candidate = {
      id: row.id,
      name: row.name,
      type: row.type,
      scope: row.scope,
      repRange: { min: row.repRangeMin, max: row.repRangeMax },
      increment: row.increment,
      baselineKg: row.baselineKg,
      unit: row.unit,
      parked: row.parked,
      notes: row.notes ?? undefined,
    };

    const result = exerciseSchema.safeParse(candidate);
    if (!result.success) {
      throw new Error(
        `Exercise row '${row.id}' failed schema validation: ${result.error.message}`,
      );
    }
    return result.data;
  });
}

/**
 * Persist a (proposed) exercise into the DB, keyed by its id.
 *
 * The input is typed `unknown` on purpose: this is a trust boundary, so the
 * caller's claim about the shape means nothing here. Every value is forced
 * through `exerciseSchema.safeParse` before a single byte reaches Prisma — a
 * failure throws a located, human-readable error instead of writing a
 * malformed row. (This is the same gate `getExercisesFromDb` applies on read;
 * applying it on write too keeps the table honest from both directions.)
 *
 * On success the nested Exercise shape is flattened to the row layout
 * (`repRange` → repRangeMin/repRangeMax, `increment` kept whole as JSON) and
 * upserted by `id`, so re-proposing an existing movement updates it rather than
 * erroring on a duplicate key. Returns the saved exercise's id.
 *
 * `baselineKg` is written through as-is — for a brand-new proposal it is 0, a
 * placeholder; the real starting weight is established later from first logging.
 */
export async function saveProposedExercise(exercise: unknown): Promise<string> {
  const result = exerciseSchema.safeParse(exercise);
  if (!result.success) {
    throw new Error(
      `Proposed exercise failed schema validation:\n${z.prettifyError(result.error)}`,
    );
  }

  const e = result.data;

  // Flatten the validated, nested Exercise into the DB column layout. The
  // increment union is stored whole as JSON; everything else maps 1:1.
  const data = {
    name: e.name,
    type: e.type,
    scope: e.scope,
    repRangeMin: e.repRange.min,
    repRangeMax: e.repRange.max,
    increment: e.increment,
    baselineKg: e.baselineKg,
    unit: e.unit,
    parked: e.parked ?? false,
    notes: e.notes ?? null,
  };

  // Upsert by id: a new movement is created, a re-proposed one is updated. The
  // id itself only needs to be set on create — it's the stable key on update.
  const saved = await prisma.exercise.upsert({
    where: { id: e.id },
    create: { id: e.id, ...data },
    update: data,
  });

  return saved.id;
}
