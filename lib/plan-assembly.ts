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
import type {
  ProposedPlan,
  ProposedExistingItem,
  ProposedNewItem,
} from '@/lib/robo';

/**
 * An EXISTING-exercise item with its engine-derived weight and rationale.
 *
 * It is the model's existing item (exerciseId + set/rep targets) intersected
 * with the engine's {@link ProgressionResult} (so `decision`/`reason` stay
 * correlated as a discriminated union) plus the resolved weight. `state` is
 * `'assembled'`. `targetWeightKg` is `null` for an exercise that has never been
 * logged and has no seed — there is honestly no number to show, so we show none
 * rather than invent one.
 */
export type AssembledExistingItem = ProposedExistingItem &
  ProgressionResult & {
    state: 'assembled';
    targetWeightKg: number | null;
  };

/**
 * A VALID brand-new movement, pending creation.
 *
 * There is no history and no baseline to progress from, so it carries no weight:
 * `targetWeightKg` is `null` and the `reason` explains that the load is set on
 * the first log. No engine decision applies — the engine is never consulted.
 */
export type AssembledPendingNewItem = Extract<ProposedNewItem, { valid: true }> & {
  state: 'pending-creation';
  targetWeightKg: null;
  reason: string;
};

/**
 * An INVALID new-movement proposal, carried through rather than dropped.
 *
 * It keeps its validation `error` (from {@link ProposedNewItem}) and gets no
 * weight. The caller can surface the problem instead of silently losing the item.
 */
export type AssembledFlaggedNewItem = Extract<ProposedNewItem, { valid: false }> & {
  state: 'flagged';
  targetWeightKg: null;
};

/**
 * A single assembled item: a discriminated union on `state`, carrying its
 * original `kind` plus whatever weight/rationale applies to that state.
 */
export type AssembledPlanItem =
  | AssembledExistingItem
  | AssembledPendingNewItem
  | AssembledFlaggedNewItem;

/** Robo's proposed plan with a weight (and rationale) attached to every item. */
export type AssembledPlan = Omit<ProposedPlan, 'items'> & {
  items: AssembledPlanItem[];
};

/**
 * Attach the right weight + state to every item in a proposed plan.
 *
 * Items are handled by kind:
 *
 *   • EXISTING items get an engine-derived weight, exactly as before. Working
 *     purely from the exercise definition + logged history:
 *       1. `evaluateProgression` decides whether the lifter earned a bump.
 *       2. If the decision is 'progress', `computeNextWeight` resolves the next
 *          load (consulting `getLadder` for the gym-dependent dumbbell/pin kinds).
 *     The resolved `targetWeightKg` follows a strict fallback chain:
 *       - the engine's suggested next weight, if it actually computed one; else
 *       - the last logged weight (we hold at what was lifted); else
 *       - the exercise's `baselineKg` seed, when there is NO logged history;
 *       - `null`, when even that seed is 0 (a never-logged, unseeded movement).
 *     These are marked `state: 'assembled'`.
 *
 *   • VALID NEW items are `state: 'pending-creation'` with `targetWeightKg: null`.
 *     A brand-new movement has no history and no baseline, so there is genuinely
 *     no number to compute — the weight is discovered from the first logged set,
 *     not invented here.
 *
 *   • INVALID NEW items are `state: 'flagged'` with their validation error and no
 *     weight. They are carried through, not dropped.
 *
 * Crucially this module NEVER calls the model. Every number it attaches comes
 * from the engine and the database — never from Robo. New movements get `null`
 * for the same reason: a number with no factual source is no number at all.
 */
export async function assemblePlanWeights(
  plan: ProposedPlan,
): Promise<AssembledPlan> {
  // The catalog: one fetch, indexed by id for per-item lookup. This is the same
  // source proposePlan validated EXISTING ids against, so each existing id
  // should resolve — but we fail loudly if one doesn't rather than silently
  // dropping an item.
  const exercises = await getExercisesFromDb();
  const exerciseById = new Map(exercises.map((e) => [e.id, e]));

  // History for the EXISTING items only, in a single batched lookup. New items
  // reference no catalog exercise and have no history, so they are excluded.
  // Exercises with no usable logged history are simply absent from the map.
  const existingIds = plan.items
    .filter((item): item is ProposedExistingItem => item.kind === 'existing')
    .map((item) => item.exerciseId);
  const lastSessionByExercise = await getLastSessionSets(existingIds);

  const items: AssembledPlanItem[] = plan.items.map((item) => {
    if (item.kind === 'new') {
      if (item.valid) {
        // Pending creation: no history, no baseline, so no weight. The load is
        // set from the lifter's first logged set — never fabricated here.
        return {
          ...item,
          state: 'pending-creation',
          targetWeightKg: null,
          reason: 'new movement — weight set on first log',
        };
      }
      // Carried through, flagged with its validation error and no weight.
      return { ...item, state: 'flagged', targetWeightKg: null };
    }

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

    return { ...item, ...progression, state: 'assembled', targetWeightKg };
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
