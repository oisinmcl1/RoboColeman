'use server';

// generate-plan.ts
// ───────────────────────────────────────────────────────────────────────────
// The two-stage plan generator behind the /plans/generate screen.
//
// Stage 1 (structure): proposePlan asks Robo for the MOVEMENTS and set/rep
//   targets — a deliberately weightless plan.
// Stage 2 (numbers):   assemblePlanWeights fills in a target weight for each
//   item purely from the engine + logged history. Robo never sees a weight.
//
// We additionally attach each exercise's human name (looked up from the DB) so
// the review UI can label rows without re-deriving names client-side.
// ───────────────────────────────────────────────────────────────────────────

import { proposePlan } from '@/lib/robo';
import { assemblePlanWeights, type AssembledPlan } from '@/lib/plan-assembly';
import { getExercisesFromDb } from '@/lib/exercises-db';

/** An assembled item plus the exercise's display name for the review UI. */
export type GeneratedPlanItem = AssembledPlan['items'][number] & {
  exerciseName: string;
};

/** The weight-enriched plan, with display names attached to every item. */
export type GeneratedPlan = Omit<AssembledPlan, 'items'> & {
  items: GeneratedPlanItem[];
};

/** Discriminated result: a validation/grounding failure, or the ready plan. */
export type GeneratePlanResult =
  | { ok: false; error: string }
  | { ok: true; plan: GeneratedPlan };

/**
 * Generate a fully-loaded plan from a free-text request.
 *
 * Robo proposes the structure (movements + set/rep targets); if that proposal
 * fails to validate or references an unknown exercise, we surface the error and
 * never reach the engine. On success the engine alone derives every weight.
 */
export async function generatePlan(request: string): Promise<GeneratePlanResult> {
  // Stage 1 — Robo proposes structure only (no weights).
  const proposed = await proposePlan(request);
  if (!proposed.ok) {
    return { ok: false, error: proposed.error };
  }

  // Stage 2 — the engine attaches every weight from history/baseline.
  const assembled = await assemblePlanWeights(proposed.plan);

  // Attach a display name to every item so the review screen can label each row.
  // Where the name comes from depends on the item's kind:
  //   - existing → the catalog (proposePlan guaranteed the id exists here);
  //   - new/valid → the proposed exercise's own name;
  //   - new/invalid (flagged) → a best-effort name from the raw value, since the
  //     proposal didn't validate and may be malformed.
  const exercises = await getExercisesFromDb();
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  const items: GeneratedPlanItem[] = assembled.items.map((item) => {
    if (item.kind === 'existing') {
      return {
        ...item,
        exerciseName: nameById.get(item.exerciseId) ?? item.exerciseId,
      };
    }
    if (item.state === 'pending-creation') {
      return { ...item, exerciseName: item.exercise.name };
    }
    // Flagged: the exercise is `unknown` (it failed validation). Pull a name out
    // if one happens to be there, otherwise fall back to a placeholder label.
    return { ...item, exerciseName: flaggedName(item.exercise) };
  });

  return { ok: true, plan: { ...assembled, items } };
}

/** Best-effort display name for a new movement that failed validation. */
function flaggedName(raw: unknown): string {
  if (
    raw &&
    typeof raw === 'object' &&
    'name' in raw &&
    typeof (raw as { name: unknown }).name === 'string'
  ) {
    return (raw as { name: string }).name;
  }
  return 'Invalid movement';
}