// engine.ts
// ───────────────────────────────────────────────────────────────────────────
// Robo Coleman — progression engine (pure functions only).
//
// Two decisions live here, kept deliberately separate:
//   1. SHOULD we progress?  → evaluateProgression() looks at the logged sets.
//   2. To WHAT weight?       → computeNextWeight() looks at the exercise's
//                              increment kind (and a runtime availability ladder
//                              for the gym-dependent kinds).
//
// Everything is pure: same inputs → same output, no I/O, no mutation. That keeps
// the rules trivially testable and lets callers compose them however they like.
// ───────────────────────────────────────────────────────────────────────────

import type { Exercise } from '@/lib/baseline';

/** One logged set. `rpe` is captured but intentionally unused for now. */
export type LoggedSet = {
  readonly weightKg: number;
  readonly reps: number;
  readonly rpe?: number;
};

/**
 * Whether to bump the weight next session. Discriminated on `decision` so the
 * caller can switch exhaustively, with a `reason` for logging/explanation.
 */
export type ProgressionResult =
  | { readonly decision: 'progress'; readonly reason: 'all-sets-at-top' }
  | {
      readonly decision: 'hold';
      readonly reason: 'missed-or-unlogged' | 'reps-below-top';
    };

/**
 * Decide whether the lifter earned a progression from these sets.
 *
 *   - no sets logged          → hold ('missed-or-unlogged')
 *   - every set hit repRange.max → progress ('all-sets-at-top')
 *   - otherwise                → hold ('reps-below-top')
 *
 * RPE is not consulted yet.
 */
export function evaluateProgression(
  exercise: Exercise,
  sets: readonly LoggedSet[],
): ProgressionResult {
  if (sets.length === 0) {
    return { decision: 'hold', reason: 'missed-or-unlogged' };
  }

  const allAtTop = sets.every((set) => set.reps >= exercise.repRange.max);
  if (allAtTop) {
    return { decision: 'progress', reason: 'all-sets-at-top' };
  }

  return { decision: 'hold', reason: 'reps-below-top' };
}

/**
 * The next weight, or a status explaining why one couldn't be produced.
 *
 *   - 'ok'           → `weightKg` is the resolved next weight.
 *   - 'needs-ladder' → a dumbbell/pin lift was asked to step without an
 *                      availability ladder; the engine refuses to guess.
 *   - 'at-ceiling'   → ladder was supplied but holds nothing heavier.
 */
export type NextWeightResult =
  | { readonly status: 'ok'; readonly weightKg: number }
  | { readonly status: 'needs-ladder' }
  | { readonly status: 'at-ceiling' };

/**
 * Compute the next weight for an exercise given its current weight.
 *
 * Free-weight kinds ('barbell', 'plate') have a fixed arithmetic step and need
 * no ladder. Gym-dependent kinds ('dumbbell-pair', 'pin') have non-uniform
 * steps, so the caller must pass `ladder` — a sorted list of actually-available
 * weights — and we return the smallest entry strictly greater than current.
 */
export function computeNextWeight(
  exercise: Exercise,
  currentWeightKg: number,
  ladder?: readonly number[],
): NextWeightResult {
  const increment = exercise.increment;

  switch (increment.kind) {
    case 'barbell':
      // +perSideKg on each side of the bar.
      return { status: 'ok', weightKg: currentWeightKg + increment.perSideKg * 2 };

    case 'plate':
      return { status: 'ok', weightKg: currentWeightKg + increment.smallestPlateKg };

    case 'dumbbell-pair':
    case 'pin': {
      if (ladder === undefined) {
        return { status: 'needs-ladder' };
      }
      const next = ladder.find((w) => w > currentWeightKg);
      if (next === undefined) {
        return { status: 'at-ceiling' };
      }
      return { status: 'ok', weightKg: next };
    }
  }
}