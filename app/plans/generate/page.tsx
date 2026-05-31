'use client';

import { useState } from 'react';
import {
  generatePlan,
  type GeneratePlanResult,
  type GeneratedPlan,
  type GeneratedPlanItem,
} from '@/app/actions/generate-plan';
import { savePlan, type SavePlanInput } from '@/app/actions/save-plan';

// A short, human-readable account of WHY the engine landed on this weight.
// This is purely the engine's decision/reason — never anything Robo said.
function decisionNote(item: GeneratedPlanItem): string {
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

export default function GeneratePlanPage() {
  // ── Request phase ──────────────────────────────────────────────────────────
  const [request, setRequest] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Review/edit phase ──────────────────────────────────────────────────────
  // The generated plan, held in state and fully owned by the user from here on.
  // Null until Robo + the engine produce one.
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
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
        setPlan(result.plan);
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

  // Patch one numeric/text field on one item; every other item passes through.
  const updateItem = <K extends keyof GeneratedPlanItem>(
    index: number,
    field: K,
    value: GeneratedPlanItem[K],
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

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    setSaveError(null);
    setSavedId(null);

    // Send the EDITED plan. A blank weight (null) becomes undefined so it is
    // saved as "no prescribed weight" rather than 0.
    const payload: SavePlanInput = {
      name: plan.name,
      note: plan.note,
      items: plan.items.map((item) => ({
        exerciseId: item.exerciseId,
        targetSets: item.targetSets,
        targetRepMin: item.targetRepMin,
        targetRepMax: item.targetRepMax,
        targetWeightKg: item.targetWeightKg ?? undefined,
      })),
    };

    try {
      const id = await savePlan(payload);
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

          {plan.items.map((item, index) => (
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
          ))}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || plan.items.length === 0}
            className="w-full rounded bg-green-600 p-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save plan'}
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