// baseline.ts
// ───────────────────────────────────────────────────────────────────────────
// Robo Coleman — seed program state ("the starting line").
//
// This is the DURABLE BASELINE: your normal split's numbers, the thing
// progression marches forward. It changes ONLY when you deliberately change it.
// Weekly instances (this week's bent-for-travel plan) are a separate, disposable
// layer and must never write back here.
//
// After week 1 the engine derives every number from real Hevy logs. These seed
// values are just where it begins.
//
// IMPORTANT NUMBER SEMANTICS
//   The *meaning* of a stored number differs by machine, so every exercise
//   carries an explicit `unit`. Do not assume "kg" means the same thing twice.
//     - barbell baselines here are stored as TRUE TOTAL (bar + both sides),
//       per the handoff. Your *input* convention is per-side; the engine
//       converts with perSideToTotalKg(). Bar defaults to 20kg but is a param
//       because the home Smith counterbalance is unknown.
//     - dumbbell  → per-hand weight
//     - plate     → either machine total or per-hand (varies; see `unit`)
//     - pin       → the stack's printed number
// ───────────────────────────────────────────────────────────────────────────

export type ExerciseType = 'barbell' | 'dumbbell' | 'plate-loaded' | 'pin-machine';

/** universal = same number any gym (free weights). home-only = stack-dependent. */
export type GymScope = 'universal' | 'home-only';

/** What the stored `baselineKg` physically represents. */
export type WeightUnit = 'total' | 'per-side' | 'per-hand' | 'stack';

export interface RepRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Discriminated union: each kind carries exactly the data the engine needs to
 * compute the *next* number when a progression is triggered.
 */
export type Increment =
  // +2.5kg per side  ⇒  +5kg true total
  | { readonly kind: 'barbell'; readonly perSideKg: number }
  // jump to the next available pair — actual step is gym-dependent, so the
  // engine resolves it against an availability list at runtime, not here.
  | { readonly kind: 'dumbbell-pair' }
  // +1 smallest plate. NOTE: smallestPlateKg values below are ASSUMPTIONS —
  // confirm against your actual plate sets.
  | { readonly kind: 'plate'; readonly smallestPlateKg: number }
  // +1 stack position. The kg per bump is non-uniform; record each observed
  // jump here over time so the engine learns the real ladder.
  | { readonly kind: 'pin'; readonly observedStepsKg?: readonly number[] };

export interface Exercise {
  /** stable key — used for engine logic and Hevy template mapping. Never rename. */
  readonly id: string;
  readonly name: string;
  readonly type: ExerciseType;
  readonly scope: GymScope;
  readonly repRange: RepRange;
  readonly increment: Increment;
  readonly baselineKg: number;
  readonly unit: WeightUnit;
  /** number's absolute value is untrusted (still usable in its home context). */
  readonly parked?: boolean;
  readonly notes?: string;
  /** filled in Phase 3 once we map names → Hevy exercise templates. */
  readonly hevyTemplateId?: string;
}

// ── Bar / plate-math helpers (the only computation Phase 0 needs) ────────────
const DEFAULT_BAR_KG = 20;

/** Your input convention → stored true total. e.g. 20/side → 60kg total. */
export const perSideToTotalKg = (perSideKg: number, barKg = DEFAULT_BAR_KG): number =>
  perSideKg * 2 + barKg;

/** Stored true total → per-side, for plate-loading display. */
export const totalToPerSideKg = (totalKg: number, barKg = DEFAULT_BAR_KG): number =>
  (totalKg - barKg) / 2;

// ── The seed program ─────────────────────────────────────────────────────────
export const BASELINE: readonly Exercise[] = [
  // Barbell — all 5–8, +2.5/side. baselineKg is TRUE TOTAL.
  { id: 'squat',        name: 'Squat',           type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 60, unit: 'total' },
  { id: 'bench',        name: 'Bench Press',     type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 60, unit: 'total' },
  { id: 'military',     name: 'Military Press',  type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 30, unit: 'total' },
  { id: 'rdl',          name: 'Romanian Deadlift', type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 60, unit: 'total' },
  { id: 'bb-incline',   name: 'BB Incline Press', type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 55, unit: 'total' },
  { id: 'bb-row',       name: 'BB Row',          type: 'barbell', scope: 'universal', repRange: { min: 5, max: 8 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 60, unit: 'total' },

  // Dumbbell — per-hand, jump to next pair.
  { id: 'db-bench',     name: 'DB Bench',        type: 'dumbbell', scope: 'universal', repRange: { min: 5, max: 8 },  increment: { kind: 'dumbbell-pair' }, baselineKg: 25,   unit: 'per-hand' },
  { id: 'db-shoulder',  name: 'DB Shoulder Press', type: 'dumbbell', scope: 'universal', repRange: { min: 5, max: 8 },  increment: { kind: 'dumbbell-pair' }, baselineKg: 17.5, unit: 'per-hand' },
  { id: 'hammer-curl',  name: 'Hammer Curl',     type: 'dumbbell', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'dumbbell-pair' }, baselineKg: 10,   unit: 'per-hand' },
  { id: 'rear-delt-fly', name: 'Rear Delt Fly',  type: 'dumbbell', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'dumbbell-pair' }, baselineKg: 5,    unit: 'per-hand' },
  { id: 'shrugs',       name: 'DB Shrugs',       type: 'dumbbell', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'dumbbell-pair' }, baselineKg: 20,   unit: 'per-hand' },

  // Plate-loaded — universal. Mix of machine-total and per-hand; see unit.
  // smallestPlateKg are ASSUMPTIONS — confirm.
  { id: 'leg-press',     name: 'Leg Press',      type: 'plate-loaded', scope: 'universal', repRange: { min: 5, max: 8 },  increment: { kind: 'plate', smallestPlateKg: 1.25 }, baselineKg: 100, unit: 'total' },
  { id: 'leg-extension', name: 'Leg Extension',  type: 'plate-loaded', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'plate', smallestPlateKg: 1.25 }, baselineKg: 50,  unit: 'total' },
  { id: 'chest-row',     name: 'Chest-Supported Row', type: 'plate-loaded', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'plate', smallestPlateKg: 1.25 }, baselineKg: 20,  unit: 'per-hand', notes: '20kg per hand.' },
  { id: 'calf-raise',    name: 'Calf Raise',     type: 'plate-loaded', scope: 'universal', repRange: { min: 10, max: 15 }, increment: { kind: 'plate', smallestPlateKg: 1.25 }, baselineKg: 25,  unit: 'total' },

  // Home pin/cable machines — home-only (stacks differ between gyms).
  { id: 'leg-curl',       name: 'Leg Curl',        type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 60,   unit: 'stack' },
  { id: 'tricep-push-v',  name: 'Tricep Push (V-bar)', type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 15,   unit: 'stack' },
  { id: 'lat-push-v',     name: 'Lat Push (V-bar)', type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 17.5, unit: 'stack' },
  { id: 'lat-pulldown',   name: 'Lat Pulldown',    type: 'pin-machine', scope: 'home-only', repRange: { min: 8, max: 12 },  increment: { kind: 'pin' }, baselineKg: 45,   unit: 'stack' },
  { id: 'face-pulls',     name: 'Face Pulls',      type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 15,   unit: 'stack' },
  { id: 'cable-lat-raise', name: 'Cable Lateral Raise', type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 3.75, unit: 'stack' },
  { id: 'chest-fly',      name: 'Chest Fly',       type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 25,   unit: 'stack' },
  { id: 'tricep-rope',    name: 'Tricep Rope',     type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 15,   unit: 'stack' },
  { id: 'preacher-curl',  name: 'Preacher Curl',   type: 'pin-machine', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'pin' }, baselineKg: 30,   unit: 'stack' },

  // Parked / uncertain — usable at home, absolute number untrusted (Smith
  // counterbalance unknown). Kept in the program so it isn't lost.
  { id: 'smith-shoulder', name: 'Smith Shoulder Press', type: 'barbell', scope: 'home-only', repRange: { min: 10, max: 15 }, increment: { kind: 'barbell', perSideKg: 2.5 }, baselineKg: 12.5, unit: 'total', parked: true, notes: 'Home Smith bar counterbalance unknown; number untrusted but usable at home.' },
];

// ── Lookups ───────────────────────────────────────────────────────────────
export const BASELINE_BY_ID: Readonly<Record<string, Exercise>> =
  Object.fromEntries(BASELINE.map((e) => [e.id, e]));

export const getExercise = (id: string): Exercise | undefined => BASELINE_BY_ID[id];
