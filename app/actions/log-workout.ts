'use server';

import { prisma } from '@/lib/prisma';

export type WorkoutSetInput = {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
};

export type WorkoutExerciseInput = {
  exerciseId: string;
  sets: WorkoutSetInput[];
};

export type SaveWorkoutInput = {
  note?: string;
  // Optional link back to the Plan this workout was performed against. When set,
  // it populates Workout.planId; deleting the Plan later nulls it (schema SetNull).
  planId?: string;
  exercises: WorkoutExerciseInput[];
};

export async function saveWorkout(input: SaveWorkoutInput): Promise<string> {
  // Flatten exercises-and-sets into flat SetLog rows, carrying each set's
  // exerciseId onto the row and deriving `order` from its index within its
  // own exercise.
  const setLogs = input.exercises.flatMap((exercise) =>
    exercise.sets.map((set, index) => ({
      exerciseId: exercise.exerciseId,
      order: index,
      weightKg: set.weightKg,
      reps: set.reps,
      rpe: set.rpe,
    })),
  );

  // One nested create writes the Workout row and all of its SetLog rows in a
  // single statement; Prisma fills in each set's workoutId from the parent.
  const workout = await prisma.workout.create({
    data: {
      note: input.note,
      planId: input.planId,
      setLogs: {
        create: setLogs,
      },
    },
  });

  return workout.id;
}