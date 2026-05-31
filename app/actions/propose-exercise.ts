'use server';

import { proposeExercise } from '@/lib/robo';
import { type Exercise } from '@/lib/exercise-schema';

// The action's result mirrors proposeExercise exactly: either a validated
// proposal or a formatted validation/parse error. The Client Component
// branches on `ok` to decide whether to render the editable form or the error.
export type ProposeExerciseResult =
  | { ok: true; exercise: Exercise }
  | { ok: false; error: string };

export async function proposeExerciseAction(
  name: string,
  hint?: string,
): Promise<ProposeExerciseResult> {
  return proposeExercise(name, hint);
}
