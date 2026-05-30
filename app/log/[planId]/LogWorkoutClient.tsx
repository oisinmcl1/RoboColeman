'use client';

import { useState } from 'react';
import { saveWorkout, type SaveWorkoutInput } from '@/app/actions/log-workout';

// Display info the server looked up from the in-code BASELINE catalog.
export type ExerciseInfo = { name: string; baselineKg: number };

// Just the fields of the plan the client touches. Defined structurally so this
// Client Component never imports the server-only @/lib/plans module.
type PlanItem = {
  id: string;
  exerciseId: string;
  targetSets: number | null;
};
type Plan = {
  id: string;
  name: string;
  note: string | null;
  items: PlanItem[];
};

type Props = {
  plan: Plan;
  lastWeights: Record<string, number>;
  exerciseInfo: Record<string, ExerciseInfo>;
};

// One editable set. Numbers are held as strings so inputs can be cleared.
type SetRow = { weightKg: string; reps: string };
// One exercise's in-progress sets for today's session.
type SessionExercise = { exerciseId: string; sets: SetRow[] };

const DEFAULT_SETS = 3;

// "" → null, otherwise parsed. The action's WorkoutSetInput uses null for blanks.
const numOrNull = (v: string): number | null => {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// Build the editable session as a *copy* of the plan. We read targetSets and the
// pre-fill weight here once; from this point on the state is independent of the
// plan, so editing today's session never mutates the stored plan.
function initSession(
  plan: Plan,
  lastWeights: Record<string, number>,
  exerciseInfo: Record<string, ExerciseInfo>,
): SessionExercise[] {
  return plan.items.map((item) => {
    const count = item.targetSets ?? DEFAULT_SETS;
    // Last logged weight wins; fall back to the baseline seed when no history.
    const seed = lastWeights[item.exerciseId] ?? exerciseInfo[item.exerciseId]?.baselineKg ?? 0;
    const weightStr = String(seed);
    return {
      exerciseId: item.exerciseId,
      sets: Array.from({ length: count }, () => ({ weightKg: weightStr, reps: '' })),
    };
  });
}

export default function LogWorkoutClient({ plan, lastWeights, exerciseInfo }: Props) {
  // Lazy initialiser runs once: the plan is copied into local state and never
  // read again, so the stored plan is untouched by anything below.
  const [session, setSession] = useState<SessionExercise[]>(() =>
    initSession(plan, lastWeights, exerciseInfo),
  );
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Replace one field on one set of one exercise; everything else passes through
  // by reference unchanged (the per-row update pattern).
  const updateSet = (
    exIndex: number,
    setIndex: number,
    field: keyof SetRow,
    value: string,
  ) =>
    setSession((prev) =>
      prev.map((ex, i) =>
        i !== exIndex
          ? ex
          : {
              ...ex,
              sets: ex.sets.map((s, j) =>
                j === setIndex ? { ...s, [field]: value } : s,
              ),
            },
      ),
    );

  const addSet = (exIndex: number) =>
    setSession((prev) =>
      prev.map((ex, i) =>
        i !== exIndex
          ? ex
          : {
              ...ex,
              // Seed the new row from the last row's weight for quick entry.
              sets: [
                ...ex.sets,
                { weightKg: ex.sets[ex.sets.length - 1]?.weightKg ?? '', reps: '' },
              ],
            },
      ),
    );

  const removeSet = (exIndex: number, setIndex: number) =>
    setSession((prev) =>
      prev.map((ex, i) =>
        i !== exIndex ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== setIndex) },
      ),
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedId(null);

    // Assemble exactly what saveWorkout expects, carrying planId so the saved
    // Workout links back to this plan.
    const payload: SaveWorkoutInput = {
      planId: plan.id,
      exercises: session.map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.map((s) => ({
          weightKg: numOrNull(s.weightKg),
          reps: numOrNull(s.reps),
          rpe: null,
        })),
      })),
    };

    try {
      const id = await saveWorkout(payload);
      setSavedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save workout');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-6">
      <h1 className="text-xl font-semibold">{plan.name}</h1>
      {plan.note && <p className="text-sm text-gray-600">{plan.note}</p>}

      {savedId && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Workout saved (id: {savedId}).
        </p>
      )}
      {error && (
        <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>
      )}

      <div className="space-y-4">
        {session.map((ex, exIndex) => (
          <div key={ex.exerciseId} className="space-y-2 rounded border border-gray-200 p-3">
            <h2 className="font-medium">{exerciseInfo[ex.exerciseId]?.name ?? ex.exerciseId}</h2>

            <div className="space-y-2">
              {ex.sets.map((set, setIndex) => (
                <div key={setIndex} className="flex items-end gap-2">
                  <span className="w-6 pb-2 text-sm text-gray-500">{setIndex + 1}</span>
                  <label className="block flex-1">
                    <span className="text-xs font-medium text-gray-600">Weight (kg)</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={set.weightKg}
                      onChange={(e) => updateSet(exIndex, setIndex, 'weightKg', e.target.value)}
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>
                  <label className="block flex-1">
                    <span className="text-xs font-medium text-gray-600">Reps</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={set.reps}
                      onChange={(e) => updateSet(exIndex, setIndex, 'reps', e.target.value)}
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSet(exIndex, setIndex)}
                    className="pb-2 text-sm text-red-600"
                    aria-label={`Remove set ${setIndex + 1}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => addSet(exIndex)}
              className="w-full rounded border border-dashed border-gray-400 p-2 text-sm"
            >
              Add set
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save workout'}
      </button>
    </main>
  );
}