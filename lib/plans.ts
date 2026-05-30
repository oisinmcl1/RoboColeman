// Server-only guard: this module reads from the database and must never be
// bundled into a Client Component. Importing it from the browser is a build error.
import 'server-only';

import { prisma } from './prisma';

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
