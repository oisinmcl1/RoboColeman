// plan-assembly.ts
// ───────────────────────────────────────────────────────────────────────────
// Turn Robo's WEIGHTLESS proposed plan into a fully-loaded one.
//
// This is the second half of "structure from Robo, numbers from the engine".
// `proposePlan` (in lib/robo.ts) lets the model choose the movements and the
// set/rep targets — and nothing else. This module fills in the one thing the
// model is forbidden to touch: the working weight. It does so WITHOUT ever
// calling the model: every weight here is derived from the exercise definition,
// the lifter's logged history, and the pure progression engine.
//
// The separation is structural, not just convention:
//   • lib/robo.ts is the only module that talks to the LLM.
//   • This module imports ProposedPlan as a TYPE only (erased at compile time),
//     so it carries no runtime dependency on the model code at all. Its inputs
//     are a plan shape and the database; its numbers come from lib/engine.ts.
//
// Server-only: it reaches the DB (via getExercisesFromDb / getLastSessionSets).
// The guard turns an accidental client import into a build error.
// ───────────────────────────────────────────────────────────────────────────

import 'server-only';

import { getExercisesFromDb } from '@/lib/exercises-db';
import { getLastSessionSets } from '@/lib/plans';
import { getLadder } from '@/lib/ladders';
import {
  evaluateProgression,
  computeNextWeight,
  type LoggedSet,
  type ProgressionResult,
} from '@/lib/engine';
import type { ProposedPlan } from '@/lib/robo';

/**
 * A single plan item with its engine-derived weight and rationale attached.
 *
 * It is the model's item (exerciseId + set/rep targets) intersected with the
 * engine's {@link ProgressionResult} (so `decision`/`reason` stay correlated as
 * a discriminated union) plus the resolved weight. `targetWeightKg` is `null`
 * for a brand-new movement that has never been logged and has no seed — there
 * is honestly no number to show, so we show none rather than invent one.
 */
export type AssembledPlanItem = ProposedPlan['items'][number] &
  ProgressionResult & {
    targetWeightKg: number | null;
  };

/** Robo's proposed plan with a weight (and rationale) attached to every item. */
export type AssembledPlan = Omit<ProposedPlan, 'items'> & {
  items: AssembledPlanItem[];
};

/**
 * Attach an engine-derived target weight to every item in a proposed plan.
 *
 * For each item, working purely from the exercise definition + logged history:
 *   1. `evaluateProgression` decides whether the lifter earned a bump.
 *   2. If the decision is 'progress', `computeNextWeight` resolves the next
 *      load (consulting `getLadder` for the gym-dependent dumbbell/pin kinds).
 *
 * The resolved `targetWeightKg` follows a strict fallback chain:
 *   - the engine's suggested next weight, if it actually computed one; else
 *   - the last logged weight (we hold at what was lifted); else
 *   - the exercise's `baselineKg` seed, when there is NO logged history at all;
 *   - `null`, when even that seed is 0 (a never-logged, unseeded movement).
 *
 * Crucially this module NEVER calls the model. Every number it attaches comes
 * from the engine and the database — never from Robo.
 */
export async function assemblePlanWeights(
  plan: ProposedPlan,
): Promise<AssembledPlan> {
  // The catalog: one fetch, indexed by id for per-item lookup. This is the same
  // source proposePlan validated against, so each id should resolve — but we
  // fail loudly if one doesn't rather than silently dropping an item.
  const exercises = await getExercisesFromDb();
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  // History for every referenced exercise in a single batched lookup (the
  // function is designed to take many ids at once). Exercises with no usable
  // logged history are simply absent from the map.
  const exerciseIds = plan.items.map((item) => item.exerciseId);
  const lastSessionByExercise = await getLastSessionSets(exerciseIds);

  const items: AssembledPlanItem[] = plan.items.map((item) => {
    const exercise = exerciseById.get(item.exerciseId);
    if (!exercise) {
      // proposePlan guarantees existence; reaching here means a stale plan was
      // assembled against a catalog that no longer contains this movement.
      throw new Error(
        `Cannot assemble plan: unknown exercise id "${item.exerciseId}".`,
      );
    }

    const sets: LoggedSet[] = lastSessionByExercise.get(item.exerciseId) ?? [];

    // The engine's verdict on this exercise's last session. Attached verbatim so
    // the UI can explain WHY a weight was chosen (progressed / held / no data).
    const progression = evaluateProgression(exercise, sets);

    const targetWeightKg = resolveTargetWeight(exercise, sets, progression);

    return { ...item, ...progression, targetWeightKg };
  });

  return { ...plan, items };
}

/**
 * Resolve a single item's target weight via the fallback chain described on
 * {@link assemblePlanWeights}. Pure given its inputs; does no I/O.
 */
function resolveTargetWeight(
  exercise: Awaited<ReturnType<typeof getExercisesFromDb>>[number],
  sets: readonly LoggedSet[],
  progression: ProgressionResult,
): number | null {
  // No logged history at all: seed from the exercise's baseline, unless that
  // baseline is 0 (a brand-new, never-logged movement) in which case there is
  // genuinely no number to offer — return null rather than fabricate one.
  if (sets.length === 0) {
    return exercise.baselineKg !== 0 ? exercise.baselineKg : null;
  }

  // There is history: the lifted weight is the floor we'd hold at.
  const lastLoggedWeight = sets[sets.length - 1].weightKg;

  // Only attempt a bump when the lifter earned it. computeNextWeight may still
  // decline (a dumbbell/pin lift with no availability ladder, or one already at
  // the top of its ladder) — in which case we fall back to the lifted weight.
  if (progression.decision === 'progress') {
    const next = computeNextWeight(exercise, lastLoggedWeight, getLadder(exercise));
    if (next.status === 'ok') {
      return next.weightKg;
    }
  }

  return lastLoggedWeight;
}
