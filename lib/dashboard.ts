// Server-only guard: this module reads from the database and must never be
// bundled into a Client Component. Importing it from the browser is a build error.
import 'server-only';

import { prisma } from './prisma';

// One point on an exercise's progress timeline: a single logged session.
//   - date:           ISO string (a primitive, so it crosses the server→client
//                     boundary cleanly — no Date instances in client props).
//   - workingWeightKg: a representative working weight for the session — the
//                     heaviest set's weight (the "top set").
//   - totalVolumeKg:  sum of weight×reps across every counted set that session.
// Imported as a *type* by the chart Client Component; type-only imports are
// erased at compile time, so none of this server-only module reaches the client.
export type ExerciseProgressPoint = {
  date: string;
  workingWeightKg: number;
  totalVolumeKg: number;
};

// One exercise's logged history as a time-ordered series (oldest → newest),
// suitable for charting. Each element is a session that contained the exercise
// and had at least one set with a real weight.
//
// We pull every Workout that contains a SetLog for this exercise (ordered by
// date), and for each one keep only that exercise's sets. From those sets we
// derive a representative working weight (the session's heaviest set) and the
// session's total volume (Σ weight×reps). Sessions where the exercise was
// present but no set had a numeric weight are skipped, so the chart never has to
// plot a meaningless gap.
export async function getExerciseProgress(
  exerciseId: string,
): Promise<ExerciseProgressPoint[]> {
  const workouts = await prisma.workout.findMany({
    // Only workouts that actually contain this exercise.
    where: { setLogs: { some: { exerciseId } } },
    orderBy: { date: 'asc' },
    select: {
      date: true,
      // Narrow the included sets to just this exercise's — a workout may hold
      // many exercises, but a point summarises only the one we're charting.
      setLogs: {
        where: { exerciseId },
        select: { weightKg: true, reps: true },
      },
    },
  });

  const series: ExerciseProgressPoint[] = [];

  for (const workout of workouts) {
    // Sets with a real weight define the working weight; volume additionally
    // needs reps. Treat nulls (a row jotted without numbers) as not-counted.
    const weights = workout.setLogs
      .map((set) => set.weightKg)
      .filter((w): w is number => w != null);

    // No numeric weight this session ⇒ nothing meaningful to plot; skip it.
    if (weights.length === 0) continue;

    const workingWeightKg = Math.max(...weights);

    const totalVolumeKg = workout.setLogs.reduce(
      (sum, set) =>
        set.weightKg != null && set.reps != null
          ? sum + set.weightKg * set.reps
          : sum,
      0,
    );

    series.push({
      date: workout.date.toISOString(),
      workingWeightKg,
      totalVolumeKg,
    });
  }

  return series;
}