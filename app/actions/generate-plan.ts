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

  // Attach display names so the review screen can label each row by name.
  // (proposePlan already guaranteed every id exists in this same catalog.)
  const exercises = await getExercisesFromDb();
  const nameById = new Map(exercises.map((e) => [e.id, e.name]));

  const items: GeneratedPlanItem[] = assembled.items.map((item) => ({
    ...item,
    exerciseName: nameById.get(item.exerciseId) ?? item.exerciseId,
  }));

  return { ok: true, plan: { ...assembled, items } };
}