// ladders.ts
// ───────────────────────────────────────────────────────────────────────────
// Availability ladders — the set of weights a given machine can ACTUALLY be set
// to. The baseline's `increment` says how to step ("next dumbbell pair", "+1
// stack position"); the ladder says what those steps land on in this gym.
//
// Only two increment kinds need a ladder:
//   - dumbbell-pair → resolve "next pair" against the rack's available weights
//   - pin           → resolve "next stack position" against the stack's plates
// barbell and plate kinds are computed arithmetically (perSideKg / smallestPlateKg)
// and never consult a ladder.
// ───────────────────────────────────────────────────────────────────────────

import type { Exercise } from '@/lib/baseline';

/**
 * Available per-hand dumbbell weights (kg), ascending.
 *
 * PLACEHOLDER VALUES — this is a standard commercial-rack progression, NOT my
 * actual gym's rack. Replace with the real observed weights when known.
 */
export const DUMBBELL_LADDER: readonly number[] = [
  2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 37.5, 40,
];

/**
 * Per-machine pin-stack ladders, keyed by exercise id. Each is the ascending
 * list of stack weights that machine can be pinned to.
 *
 * Pin stacks are non-uniform and machine-specific, so each starts EMPTY. Fill
 * in each machine's real observed stack values as I learn them (read them off
 * the stack at the gym).
 */
export const PIN_LADDERS: Readonly<Record<string, readonly number[]>> = {
  'leg-curl': [],
  'tricep-push-v': [],
  'lat-push-v': [],
  'lat-pulldown': [],
  'face-pulls': [],
  'cable-lat-raise': [],
  'chest-fly': [],
  'tricep-rope': [],
  'preacher-curl': [],
};

/**
 * The availability ladder for an exercise, or undefined when none applies.
 *   - dumbbell-pair → the shared DUMBBELL_LADDER
 *   - pin           → that machine's PIN_LADDERS entry, or undefined if it's
 *                     missing/empty (not yet observed)
 *   - barbell / plate → undefined (arithmetic increment, no ladder)
 */
export function getLadder(exercise: Exercise): readonly number[] | undefined {
  switch (exercise.increment.kind) {
    case 'dumbbell-pair':
      return DUMBBELL_LADDER;
    case 'pin': {
      const ladder = PIN_LADDERS[exercise.id];
      return ladder && ladder.length > 0 ? ladder : undefined;
    }
    default:
      return undefined;
  }
}