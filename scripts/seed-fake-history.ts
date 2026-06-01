// scripts/seed-fake-history.ts
// ───────────────────────────────────────────────────────────────────────────
// DEV-ONLY one-off seed: fabricate realistic-looking training history so the
// dashboards can be built against real-shaped data before any real logs exist.
//
// Run with (this project keeps env vars in .env.local, and the Prisma Client is
// imported through `server-only`, so the react-server condition is required):
//   npx tsx --conditions=react-server --env-file=.env.local scripts/seed-fake-history.ts
//
// EVERY Workout this script writes has a `note` that STARTS WITH the literal
// marker "[SEED]". That marker is the entire isolation contract: it is how fake
// data is identified, and how scripts/clear-fake-history.ts removes it without
// ever touching a real (unmarked) log.
//
// Idempotent: it deletes all existing [SEED]-marked workouts first (their
// SetLogs cascade away), then regenerates. Re-running never duplicates.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { BASELINE_BY_ID, type Exercise } from '@/lib/baseline';

// The marker that brands a workout as fake. Shared with clear-fake-history.ts.
// Keep these two in sync — this string is the only thing separating disposable
// fake data from a real training log.
const SEED_MARKER = '[SEED]';

// A spread of exercise *types* so dashboards see every shape of number:
// barbell total, dumbbell per-hand, plate-loaded total.
const SEEDED_EXERCISE_IDS = ['squat', 'bench', 'rdl', 'db-bench', 'leg-press'] as const;

const WORKING_SETS = 3; // sets per exercise per session
const START_BUMPS_BELOW_BASELINE = 3; // begin this many weight-jumps under baseline
const STALL_CHANCE = 0.12; // odds a given week fails to advance reps (a plateau)
const MISS_REP_CHANCE = 0.18; // odds the last set drops a rep (a near-miss)
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The kg added on a weight bump, derived from each exercise's real `increment`.
 * Barbell/plate bumps load BOTH sides, so the true-total step is doubled.
 */
function weightStepKg(ex: Exercise): number {
  switch (ex.increment.kind) {
    case 'barbell':
      return ex.increment.perSideKg * 2; // +2.5/side ⇒ +5kg total
    case 'plate':
      return ex.increment.smallestPlateKg * 2; // +1 plate per side
    case 'dumbbell-pair':
      return 2.5; // jump to the next pair (gym-dependent; 2.5/hand is typical)
    case 'pin':
      return 5; // typical stack step (no pin exercises are seeded, but be total)
  }
}

const roundToHalf = (n: number): number => Math.round(n * 2) / 2;

/** Plausible RPE that rises as reps climb toward the top of the range. */
function rpeFor(reps: number, ex: Exercise): number {
  const { min, max } = ex.repRange;
  const frac = max === min ? 1 : (reps - min) / (max - min);
  return roundToHalf(Math.min(9.5, Math.max(6.5, 7 + frac * 2.5)));
}

interface PlannedSet {
  weightKg: number;
  reps: number;
  rpe: number;
}

/**
 * Walk one exercise forward through `weeks` sessions using double progression:
 * climb reps from min→max at a fixed weight, then bump the weight and reset reps
 * to min. Sprinkle in the occasional stall (no rep gain) and missed last-set rep
 * so the curve looks human rather than mechanical.
 */
function buildProgression(ex: Exercise, weeks: number): PlannedSet[][] {
  const step = weightStepKg(ex);
  const { min, max } = ex.repRange;

  // Start a few weight-bumps below baseline so there's a clear climb that
  // crosses the baseline partway through the history. Never go non-positive.
  let weightKg = Math.max(step, ex.baselineKg - step * START_BUMPS_BELOW_BASELINE);
  let targetReps = min;

  const sessions: PlannedSet[][] = [];

  for (let w = 0; w < weeks; w++) {
    const sets: PlannedSet[] = [];
    for (let s = 0; s < WORKING_SETS; s++) {
      // The last set occasionally drops a rep — a realistic near-miss.
      const missed = s === WORKING_SETS - 1 && Math.random() < MISS_REP_CHANCE;
      const reps = Math.max(min, missed ? targetReps - 1 : targetReps);
      sets.push({ weightKg, reps, rpe: rpeFor(reps, ex) });
    }
    sessions.push(sets);

    // Advance state for next week.
    const hitTopOfRange = sets.every((set) => set.reps >= max);
    if (hitTopOfRange) {
      // Completed every set at the top of the range ⇒ add weight, reset reps.
      weightKg += step;
      targetReps = min;
    } else if (Math.random() >= STALL_CHANCE) {
      // Normal progress: add a rep (capped at the top of the range).
      targetReps = Math.min(max, targetReps + 1);
    }
    // else: stalled this week — repeat the same target next week.
  }

  return sessions;
}

async function main() {
  const exercises = SEEDED_EXERCISE_IDS.map((id) => {
    const ex = BASELINE_BY_ID[id];
    if (!ex) throw new Error(`Seed exercise '${id}' is not in BASELINE`);
    return ex;
  });

  // ── Idempotency: wipe any prior fake history first ───────────────────────
  // Match on the marker; SetLogs cascade away with their parent Workout.
  const purged = await prisma.workout.deleteMany({
    where: { note: { startsWith: SEED_MARKER } },
  });
  console.log(`Cleared ${purged.count} existing ${SEED_MARKER} workout(s) before reseeding.`);

  // Roughly 10–12 weekly sessions, going back in time from today.
  const weeks = 10 + Math.floor(Math.random() * 3); // 10, 11, or 12
  const now = Date.now();

  // Build each exercise's independent progression curve.
  const curves = exercises.map((ex) => ({ ex, sessions: buildProgression(ex, weeks) }));

  let workoutsCreated = 0;
  let setsCreated = 0;

  // One Workout per week; each contains the working sets for every seeded
  // exercise that week — the shape a real multi-lift session would have.
  for (let w = 0; w < weeks; w++) {
    const weeksAgo = weeks - 1 - w; // oldest session first
    const date = new Date(now - weeksAgo * MS_PER_WEEK);

    let order = 0;
    const setLogs = curves.flatMap(({ ex, sessions }) =>
      sessions[w].map((set) => ({
        exerciseId: ex.id,
        order: order++,
        weightKg: set.weightKg,
        reps: set.reps,
        rpe: set.rpe,
      })),
    );

    await prisma.workout.create({
      data: {
        date,
        // CRITICAL: note MUST start with the marker so this data is removable.
        note: `${SEED_MARKER} Week ${w + 1}/${weeks} — generated dev history`,
        setLogs: { create: setLogs },
      },
    });

    workoutsCreated++;
    setsCreated += setLogs.length;
  }

  console.log(
    `\nDone. Seeded ${workoutsCreated} ${SEED_MARKER} workout(s) ` +
      `(${weeks} weeks) with ${setsCreated} set log(s) across ` +
      `${exercises.length} exercises: ${exercises.map((e) => e.id).join(', ')}.`,
  );
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
