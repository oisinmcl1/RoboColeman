'use server';

import { saveProposedExercise } from '@/lib/exercises-db';
import { type Exercise } from '@/lib/exercise-schema';

// The contract between this action and any caller (UI or the propose flow). It
// is the validated Exercise shape — but the action does NOT trust it: the value
// is re-validated inside saveProposedExercise before it touches the DB.
export type SaveExerciseInput = Exercise;

export async function saveExercise(exercise: SaveExerciseInput): Promise<string> {
  return saveProposedExercise(exercise);
}
