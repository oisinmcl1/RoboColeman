// Server-only guard: this module reads from the database and must never be
// bundled into a Client Component. Importing it from the browser is a build error.
import 'server-only';

import { prisma } from './prisma';
import type { LoggedSet } from './engine';

// All plans with their items. Plans are newest-first; within each plan, items
// follow their explicit `order` field so the UI renders them in author order.
export async function getPlans() {
  return prisma.plan.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      items: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

// A single plan with its items in author order, or null if no plan has that id.
// Mirrors the per-plan `include` used by getPlans so callers get the same shape.
export async function getPlan(planId: string) {
  return prisma.plan.findUnique({
    where: { id: planId },
    include: {
      items: {
        orderBy: { order: 'asc' },
      },
    },
  });
}

// For each requested exercise, the weight from its most recently logged set.
// Returns a Map keyed by exerciseId; exercises with no logged weight are absent.
export async function getLastLoggedWeights(
  exerciseIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (exerciseIds.length === 0) return result;

  // One lookup per exercise: the single most recent SetLog that has a weight.
  // We order through the Workout relation by date (desc) and take the first row,
  // so each query returns just the latest logged set for that exercise.
  const latest = await Promise.all(
    exerciseIds.map((exerciseId) =>
      prisma.setLog.findFirst({
        where: { exerciseId, weightKg: { not: null } },
        orderBy: { workout: { date: 'desc' } },
        select: { exerciseId: true, weightKg: true },
      }),
    ),
  );

  for (const set of latest) {
    // findFirst returns null when the exercise has no logged history; weightKg
    // is non-null here because the query filters it out.
    if (set?.weightKg != null) {
      result.set(set.exerciseId, set.weightKg);
    }
  }

  return result;
}

// For each requested exercise, every set logged in its most recent session.
//
// "Most recent session" = the latest Workout (by date) that contains at least
// one SetLog for the exercise. We return ALL of that workout's sets for the
// exercise — not just the top one — because the progression engine evaluates a
// session as a whole (see evaluateProgression: it only progresses when *every*
// set hit the rep ceiling).
//
// Returns a Map keyed by exerciseId; exercises with no usable logged history
// are absent. Sets come back in their logged `order`.
export async function getLastSessionSets(
  exerciseIds: string[],
): Promise<Map<string, LoggedSet[]>> {
  const result = new Map<string, LoggedSet[]>();
  if (exerciseIds.length === 0) return result;

  await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      // Step 1: identify the most recent workout with a set for this exercise.
      // Ordering through the Workout relation by date (desc) and taking the
      // first row gives us that workout's id.
      const mostRecent = await prisma.setLog.findFirst({
        where: { exerciseId },
        orderBy: { workout: { date: 'desc' } },
        select: { workoutId: true },
      });
      if (!mostRecent) return; // no logged history for this exercise

      // Step 2: pull every set this exercise logged in that same workout, in
      // the order they were performed.
      const sets = await prisma.setLog.findMany({
        where: { workoutId: mostRecent.workoutId, exerciseId },
        orderBy: { order: 'asc' },
        select: { weightKg: true, reps: true, rpe: true },
      });

      // LoggedSet requires concrete weightKg and reps; drop sets missing either
      // (e.g. a warm-up row jotted down without numbers) so the shape is valid.
      const loggedSets: LoggedSet[] = sets
        .filter(
          (set): set is { weightKg: number; reps: number; rpe: number | null } =>
            set.weightKg != null && set.reps != null,
        )
        .map((set) => ({
          weightKg: set.weightKg,
          reps: set.reps,
          ...(set.rpe != null ? { rpe: set.rpe } : {}),
        }));

      if (loggedSets.length > 0) {
        result.set(exerciseId, loggedSets);
      }
    }),
  );

  return result;
}
