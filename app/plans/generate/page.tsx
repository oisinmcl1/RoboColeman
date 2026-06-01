'use client';

import { useState } from 'react';
import {
  generatePlan,
  type GeneratePlanResult,
  type GeneratedPlan,
  type GeneratedPlanItem,
} from '@/app/actions/generate-plan';
import { savePlan, type SavePlanInput } from '@/app/actions/save-plan';
import { saveExercise } from '@/app/actions/save-exercise';
import type { Increment } from '@/lib/exercise-schema';

// Review-time wrapper: a generated item plus an `approved` flag for the
// new-movement case. Existing/flagged items ignore it. The conditional type is
// DISTRIBUTIVE — it adds the flag to each union member individually rather than
// to the union as a whole, so `state`-based narrowing still works downstream.
type WithApproval<T> = T extends unknown ? T & { approved?: boolean } : never;
type ReviewItem = WithApproval<GeneratedPlanItem>;
type ReviewPlan = Omit<GeneratedPlan, 'items'> & { items: ReviewItem[] };

// An existing-exercise item, assembled with an engine-derived weight. Pulled out
// as a named type so the weight-rationale note can demand exactly this variant.
type AssembledItem = Extract<ReviewItem, { state: 'assembled' }>;

// A short, human-readable account of WHY the engine landed on this weight.
// This is purely the engine's decision/reason — never anything Robo said.
function decisionNote(item: AssembledItem): string {
  if (item.decision === 'progress') {
    return 'progressed — hit top reps last session';
  }
  switch (item.reason) {
    case 'missed-or-unlogged':
      return 'held — not logged yet';
    case 'reps-below-top':
      return 'held — reps below top last session';
  }
}

// A compact, human-readable label for a new movement's loading mechanism.
function incrementLabel(increment: Increment): string {
  switch (increment.kind) {
    case 'barbell':
      return `barbell (+${increment.perSideKg}kg/side)`;
    case 'dumbbell-pair':
      return 'dumbbell pair';
    case 'plate':
      return `plate (smallest ${increment.smallestPlateKg}kg)`;
    case 'pin':
      return 'pin/stack';
  }
}

export default function GeneratePlanPage() {
  // ── Request phase ──────────────────────────────────────────────────────────
  const [request, setRequest] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Review/edit phase ──────────────────────────────────────────────────────
  // The generated plan, held in state and fully owned by the user from here on.
  // Null until Robo + the engine produce one.
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    setPlan(null);
    setSavedId(null);
    setSaveError(null);

    try {
      const result: GeneratePlanResult = await generatePlan(request.trim());
      if (result.ok) {
        // New movements start UN-approved: the lifter must opt each one in.
        // Existing and flagged items don't use the flag.
        setPlan({
          ...result.plan,
          items: result.plan.items.map((item) =>
            item.kind === 'new' && item.state === 'pending-creation'
              ? { ...item, approved: false }
              : item,
          ),
        });
      } else {
        setGenerateError(result.error);
      }
    } catch (e) {
      setGenerateError(e instanceof Error ? e.message : 'Failed to reach Robo');
    } finally {
      setGenerating(false);
    }
  };

  const updateName = (name: string) =>
    setPlan((prev) => (prev ? { ...prev, name } : prev));

  // Patch one field on one item; every other item passes through. Typed against
  // ReviewItem so set/rep edits and the `approved` toggle share one updater.
  const updateItem = <K extends keyof ReviewItem>(
    index: number,
    field: K,
    value: ReviewItem[K],
  ) =>
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((item, i) =>
              i === index ? { ...item, [field]: value } : item,
            ),
          }
        : prev,
    );

  const removeItem = (index: number) =>
    setPlan((prev) =>
      prev
        ? { ...prev, items: prev.items.filter((_, i) => i !== index) }
        : prev,
    );

  // Which items will actually be written: existing items always; approved new
  // movements; never flagged ones. The type predicate drops 'flagged' from the
  // resulting type, so the save payload can rely on the surviving fields.
  const includableItems = plan
    ? plan.items.filter(
        (
          item,
        ): item is Extract<
          ReviewItem,
          { state: 'assembled' | 'pending-creation' }
        > =>
          item.state === 'assembled' ||
          (item.state === 'pending-creation' && !!item.approved),
      )
    : [];
  const flaggedCount = plan
    ? plan.items.filter((item) => item.state === 'flagged').length
    : 0;

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    setSaveError(null);
    setSavedId(null);

    try {
      // STEP 1 — create every APPROVED new movement first. saveExercise upserts
      // the proposed definition (stamping baselineKg: 0 — the real weight is set
      // on first log) and returns its real id, which the plan will reference.
      // This must happen before savePlan: a PlanItem's exerciseId is a foreign
      // key, so the Exercise row has to exist before the plan can point at it.
      const newIdByExerciseId = new Map<string, string>();
      for (const item of plan.items) {
        if (item.state === 'pending-creation' && item.approved) {
          const createdId = await saveExercise({
            ...item.exercise,
            baselineKg: 0,
          });
          newIdByExerciseId.set(item.exercise.id, createdId);
        }
      }

      // STEP 2 — build the plan from includable items only (existing + approved
      // new; flagged are excluded entirely). A blank weight (null) becomes
      // undefined so it's saved as "no prescribed weight" rather than 0; a
      // brand-new movement intentionally carries no weight (set on first log).
      const items: SavePlanInput['items'] = includableItems.map((item) => {
        if (item.state === 'pending-creation') {
          return {
            exerciseId: newIdByExerciseId.get(item.exercise.id) ?? item.exercise.id,
            targetSets: item.targetSets,
            targetRepMin: item.targetRepMin,
            targetRepMax: item.targetRepMax,
            // No weight: a new movement's load is established on first logging.
            targetWeightKg: undefined,
          };
        }
        // Existing/assembled item: reference its catalog id and engine weight.
        return {
          exerciseId: item.exerciseId,
          targetSets: item.targetSets,
          targetRepMin: item.targetRepMin,
          targetRepMax: item.targetRepMax,
          targetWeightKg: item.targetWeightKg ?? undefined,
        };
      });

      const id = await savePlan({ name: plan.name, note: plan.note, items });
      setSavedId(id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-xl font-semibold">Generate a plan with Robo</h1>

      {/* ── Request form ──────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded border border-gray-200 p-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">
            What do you want to train?
          </span>
          <input
            type="text"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="A push day for my home gym"
            className="mt-1 w-full rounded border border-gray-300 p-2"
          />
        </label>
        <p className="text-xs text-gray-500">
          e.g. “Travelling, 40 min, dumbbells only”
        </p>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || request.trim() === ''}
          className="w-full rounded bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {generating ? 'Robo is cooking…' : 'Generate with Robo'}
        </button>
      </div>

      {generateError && (
        <div className="rounded bg-red-100 p-3 text-sm text-red-800">
          <p className="font-medium">Robo couldn’t build that plan:</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
            {generateError}
          </pre>
          <p className="mt-2">Tweak your request and try again.</p>
        </div>
      )}

      {/* ── Editable review ───────────────────────────────────────────────── */}
      {plan && (
        <div className="space-y-4">
          <div className="space-y-2 rounded border border-gray-200 p-3">
            <h2 className="font-medium">Review &amp; edit — nothing is saved yet</h2>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Plan name</span>
              <input
                type="text"
                value={plan.name}
                onChange={(e) => updateName(e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
          </div>

          {plan.items.map((item, index) => {
            // ── FLAGGED: a new movement that failed validation ───────────────
            // Shown in a warning style, excluded from save, removable only.
            if (item.state === 'flagged') {
              return (
                <div
                  key={`flagged-${index}`}
                  className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-amber-900">
                      {item.exerciseName}
                    </span>
                    <span className="rounded bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                      INVALID — won’t be saved
                    </span>
                  </div>
                  <p className="text-xs text-amber-800">
                    Robo proposed a new movement that didn’t pass validation, so
                    it can’t be added to the plan. Remove it and try again.
                  </p>
                  <pre className="whitespace-pre-wrap break-words rounded bg-amber-100 p-2 text-xs text-amber-900">
                    {item.error}
                  </pre>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-sm font-medium text-red-600"
                  >
                    Remove
                  </button>
                </div>
              );
            }

            // ── PENDING-CREATION: a valid new movement needing approval ──────
            if (item.state === 'pending-creation') {
              return (
                <div
                  key={`new-${index}`}
                  className={`space-y-2 rounded border p-3 ${
                    item.approved
                      ? 'border-purple-400 bg-purple-50'
                      : 'border-purple-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{item.exerciseName}</span>
                    <span className="rounded bg-purple-200 px-2 py-0.5 text-xs font-semibold text-purple-900">
                      NEW — needs approval
                    </span>
                  </div>

                  {/* Read-only definition of the proposed movement. */}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                    <div>
                      <dt className="inline font-medium">Type: </dt>
                      <dd className="inline">{item.exercise.type}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Scope: </dt>
                      <dd className="inline">{item.exercise.scope}</dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Rep range: </dt>
                      <dd className="inline">
                        {item.exercise.repRange.min}–{item.exercise.repRange.max}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline font-medium">Loading: </dt>
                      <dd className="inline">
                        {incrementLabel(item.exercise.increment)}
                      </dd>
                    </div>
                  </dl>

                  {/* Lightly editable: set/rep targets only. */}
                  <div className="grid grid-cols-3 gap-2">
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">
                        Sets
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={item.targetSets}
                        onChange={(e) =>
                          updateItem(index, 'targetSets', Number(e.target.value))
                        }
                        className="mt-1 w-full rounded border border-gray-300 p-2"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">
                        Rep min
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={item.targetRepMin}
                        onChange={(e) =>
                          updateItem(index, 'targetRepMin', Number(e.target.value))
                        }
                        className="mt-1 w-full rounded border border-gray-300 p-2"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-gray-600">
                        Rep max
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={item.targetRepMax}
                        onChange={(e) =>
                          updateItem(index, 'targetRepMax', Number(e.target.value))
                        }
                        className="mt-1 w-full rounded border border-gray-300 p-2"
                      />
                    </label>
                  </div>

                  {/* Weight is intentionally not editable for a new movement. */}
                  <p className="text-xs text-gray-500">
                    Weight: <span className="font-medium">set on first log</span>{' '}
                    — {item.reason}
                  </p>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={item.approved ?? false}
                        onChange={(e) =>
                          updateItem(index, 'approved', e.target.checked)
                        }
                      />
                      <span className="font-medium">Approve this movement</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-sm text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            }

            // ── ASSEMBLED: an existing exercise with an engine weight ────────
            return (
              <div
                key={`${item.exerciseId}-${index}`}
                className="space-y-2 rounded border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{item.exerciseName}</span>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="text-sm text-red-600"
                  >
                    Remove
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">Sets</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.targetSets}
                      onChange={(e) =>
                        updateItem(index, 'targetSets', Number(e.target.value))
                      }
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">
                      Weight (kg)
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={item.targetWeightKg ?? ''}
                      onChange={(e) =>
                        updateItem(
                          index,
                          'targetWeightKg',
                          e.target.value === '' ? null : Number(e.target.value),
                        )
                      }
                      placeholder="none yet"
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">
                      Rep min
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.targetRepMin}
                      onChange={(e) =>
                        updateItem(index, 'targetRepMin', Number(e.target.value))
                      }
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs font-medium text-gray-600">
                      Rep max
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item.targetRepMax}
                      onChange={(e) =>
                        updateItem(index, 'targetRepMax', Number(e.target.value))
                      }
                      className="mt-1 w-full rounded border border-gray-300 p-2"
                    />
                  </label>
                </div>

                {/* Read-only: the engine's rationale for the weight above. */}
                <p className="text-xs text-gray-500">{decisionNote(item)}</p>
              </div>
            );
          })}

          {flaggedCount > 0 && (
            <p className="text-xs text-amber-700">
              {flaggedCount} invalid movement{flaggedCount > 1 ? 's' : ''} will be
              skipped. Remove {flaggedCount > 1 ? 'them' : 'it'} to clean up the
              plan.
            </p>
          )}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || includableItems.length === 0}
            className="w-full rounded bg-green-600 p-3 font-medium text-white disabled:opacity-50"
          >
            {saving
              ? 'Saving…'
              : `Save plan${
                  includableItems.length > 0
                    ? ` (${includableItems.length} item${
                        includableItems.length > 1 ? 's' : ''
                      })`
                    : ''
                }`}
          </button>
        </div>
      )}

      {savedId && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Plan saved! id: <span className="font-mono">{savedId}</span>
        </p>
      )}
      {saveError && (
        <div className="rounded bg-red-100 p-3 text-sm text-red-800">
          <p className="font-medium">Couldn’t save:</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
            {saveError}
          </pre>
        </div>
      )}
    </main>
  );
}