import { describe, it, expect } from 'vitest';
import type { Exercise } from '@/lib/baseline';
import {
  evaluateProgression,
  computeNextWeight,
  type LoggedSet,
} from '@/lib/engine';

// ── Inline fakes ─────────────────────────────────────────────────────────────
// We build minimal Exercise objects by hand rather than importing BASELINE, so
// each test states exactly the inputs it depends on and nothing else. `makeEx`
// fills the fields the engine never reads (id/name/scope/etc.) and lets each
// test override the two it cares about: `repRange` and `increment`.
function makeEx(overrides: Partial<Exercise>): Exercise {
  return {
    id: 'fake',
    name: 'Fake Lift',
    type: 'barbell',
    scope: 'universal',
    repRange: { min: 5, max: 8 },
    increment: { kind: 'barbell', perSideKg: 2.5 },
    baselineKg: 50,
    unit: 'total',
    ...overrides,
  };
}

const set = (reps: number, weightKg = 50): LoggedSet => ({ reps, weightKg });

describe('evaluateProgression', () => {
  const ex = makeEx({ repRange: { min: 5, max: 8 } });

  it("progresses when every set's reps are at or above the rep-range max", () => {
    const sets = [set(8), set(8), set(9)]; // 9 is above max → still counts
    const result = evaluateProgression(ex, sets);
    expect(result.decision).toBe('progress');
    expect(result.reason).toBe('all-sets-at-top');
  });

  it('holds when a single set falls below the max', () => {
    const sets = [set(8), set(8), set(7)]; // last set short by one rep
    const result = evaluateProgression(ex, sets);
    expect(result.decision).toBe('hold');
    expect(result.reason).toBe('reps-below-top');
  });

  it("holds with 'missed-or-unlogged' when no sets were logged", () => {
    const result = evaluateProgression(ex, []);
    expect(result.decision).toBe('hold');
    expect(result.reason).toBe('missed-or-unlogged');
  });

  it('holds when only the first set hits the top and later sets fall short', () => {
    // Double-progression rule: a strong opener doesn't earn the bump; the whole
    // session must reach the top.
    const sets = [set(8), set(6), set(5)];
    const result = evaluateProgression(ex, sets);
    expect(result.decision).toBe('hold');
    expect(result.reason).toBe('reps-below-top');
  });
});

describe('computeNextWeight', () => {
  it('adds perSideKg × 2 for a barbell exercise', () => {
    const ex = makeEx({ increment: { kind: 'barbell', perSideKg: 2.5 } });
    const result = computeNextWeight(ex, 60);
    expect(result).toEqual({ status: 'ok', weightKg: 65 }); // 60 + 2.5×2
  });

  it('adds smallestPlateKg for a plate exercise', () => {
    const ex = makeEx({
      type: 'plate-loaded',
      increment: { kind: 'plate', smallestPlateKg: 1.25 },
    });
    const result = computeNextWeight(ex, 100);
    expect(result).toEqual({ status: 'ok', weightKg: 101.25 });
  });

  it("returns 'needs-ladder' for a dumbbell-pair with no ladder", () => {
    const ex = makeEx({ type: 'dumbbell', increment: { kind: 'dumbbell-pair' } });
    const result = computeNextWeight(ex, 25);
    expect(result).toEqual({ status: 'needs-ladder' });
  });

  it('returns the next ladder weight strictly above current for a dumbbell-pair', () => {
    const ex = makeEx({ type: 'dumbbell', increment: { kind: 'dumbbell-pair' } });
    const ladder = [22.5, 25, 27.5, 30];
    const result = computeNextWeight(ex, 25, ladder); // skips 25 itself
    expect(result).toEqual({ status: 'ok', weightKg: 27.5 });
  });

  it("returns 'at-ceiling' for a dumbbell-pair already at the top of its ladder", () => {
    const ex = makeEx({ type: 'dumbbell', increment: { kind: 'dumbbell-pair' } });
    const ladder = [22.5, 25, 27.5, 30];
    const result = computeNextWeight(ex, 30, ladder); // nothing heavier than 30
    expect(result).toEqual({ status: 'at-ceiling' });
  });
});