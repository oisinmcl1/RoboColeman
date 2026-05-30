// exercise-schema.ts
// ───────────────────────────────────────────────────────────────────────────
// Zod schemas mirroring the static types in baseline.ts.
//
// baseline.ts is the source of TRUTH for the *shape* of an exercise, but its
// types are compile-time only — they vanish at runtime. These schemas are the
// runtime counterpart: they can actually inspect a value (a DB row, a JSON
// blob, an API response) and decide whether it really is an Exercise.
//
// The TS types are then DERIVED from the schemas via z.infer, so there is one
// definition, not two: change a schema and the exported type changes with it.
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

// ── Leaf enums (mirror the string-literal unions in baseline.ts) ─────────────
export const exerciseTypeSchema = z.enum([
  'barbell',
  'dumbbell',
  'plate-loaded',
  'pin-machine',
]);

export const gymScopeSchema = z.enum(['universal', 'home-only']);

export const weightUnitSchema = z.enum(['total', 'per-side', 'per-hand', 'stack']);

// ── RepRange ─────────────────────────────────────────────────────────────────
export const repRangeSchema = z.object({
  min: z.number().int(),
  max: z.number().int(),
});

// ── Increment (discriminated union on `kind`) ────────────────────────────────
// Each variant carries exactly the data its progression rule needs. Zod keys
// off the literal `kind` to pick which variant's rules to apply.
export const incrementSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('barbell'),
    perSideKg: z.number(),
  }),
  z.object({
    kind: z.literal('dumbbell-pair'),
  }),
  z.object({
    kind: z.literal('plate'),
    smallestPlateKg: z.number(),
  }),
  z.object({
    kind: z.literal('pin'),
    // optional ladder of observed kg-per-bump, learned over time.
    observedStepsKg: z.array(z.number()).readonly().optional(),
  }),
]);

// ── Exercise (the full shape) ────────────────────────────────────────────────
export const exerciseSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: exerciseTypeSchema,
  scope: gymScopeSchema,
  repRange: repRangeSchema,
  increment: incrementSchema,
  baselineKg: z.number(),
  unit: weightUnitSchema,
  parked: z.boolean().optional(),
  notes: z.string().optional(),
});

// ── Derived static types (single source of truth — see z.infer) ──────────────
export type ExerciseType = z.infer<typeof exerciseTypeSchema>;
export type GymScope = z.infer<typeof gymScopeSchema>;
export type WeightUnit = z.infer<typeof weightUnitSchema>;
export type RepRange = z.infer<typeof repRangeSchema>;
export type Increment = z.infer<typeof incrementSchema>;
export type Exercise = z.infer<typeof exerciseSchema>;