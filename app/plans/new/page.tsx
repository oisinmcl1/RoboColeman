'use client';

import { useState } from 'react';
import { BASELINE } from '@/lib/baseline';
import { savePlan, type SavePlanInput } from '@/app/actions/save-plan';

// A row mirrors SavePlanItemInput, but every numeric field is held as a string
// so the inputs can be empty. We convert "" → undefined when assembling the
// payload, which keeps the optional fields genuinely optional.
type ItemRow = {
  exerciseId: string;
  targetSets: string;
  targetRepMin: string;
  targetRepMax: string;
  targetWeightKg: string;
};

const emptyRow = (): ItemRow => ({
  exerciseId: BASELINE[0]?.id ?? '',
  targetSets: '',
  targetRepMin: '',
  targetRepMax: '',
  targetWeightKg: '',
});

// "" → undefined, otherwise parse. Drops the field from the payload entirely
// when blank rather than sending NaN or 0.
const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
};

export default function NewPlanPage() {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addItem = () => setItems((prev) => [...prev, emptyRow()]);

  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  // Replace just the changed field on just the targeted row; every other row
  // is passed through by reference unchanged.
  const updateItem = <K extends keyof ItemRow>(
    index: number,
    field: K,
    value: ItemRow[K],
  ) =>
    setItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedId(null);

    // Assemble a value matching SavePlanInput exactly.
    const payload: SavePlanInput = {
      name,
      note: note.trim() === '' ? undefined : note,
      items: items.map((row) => ({
        exerciseId: row.exerciseId,
        targetSets: num(row.targetSets),
        targetRepMin: num(row.targetRepMin),
        targetRepMax: num(row.targetRepMax),
        targetWeightKg: num(row.targetWeightKg),
      })),
    };

    try {
      const id = await savePlan(payload);
      setSavedId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-md p-4 space-y-6">
      <h1 className="text-xl font-semibold">New plan</h1>

      {savedId && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Plan saved (id: {savedId}).
        </p>
      )}
      {error && (
        <p className="rounded bg-red-100 p-3 text-sm text-red-800">{error}</p>
      )}

      <div className="space-y-3">
        <label className="block">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
            placeholder="Plan name"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Note (optional)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 p-2"
            placeholder="Optional note"
          />
        </label>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-medium">Movements</h2>

        {items.map((row, index) => (
          <div
            key={index}
            className="space-y-2 rounded border border-gray-200 p-3"
          >
            <label className="block">
              <span className="text-sm font-medium">Exercise</span>
              <select
                value={row.exerciseId}
                onChange={(e) => updateItem(index, 'exerciseId', e.target.value)}
                className="mt-1 w-full rounded border border-gray-300 p-2"
              >
                {BASELINE.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-sm font-medium">Sets</span>
                <input
                  type="number"
                  value={row.targetSets}
                  onChange={(e) =>
                    updateItem(index, 'targetSets', e.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 p-2"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Weight (kg)</span>
                <input
                  type="number"
                  value={row.targetWeightKg}
                  onChange={(e) =>
                    updateItem(index, 'targetWeightKg', e.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 p-2"
                  placeholder="optional"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Rep min</span>
                <input
                  type="number"
                  value={row.targetRepMin}
                  onChange={(e) =>
                    updateItem(index, 'targetRepMin', e.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 p-2"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium">Rep max</span>
                <input
                  type="number"
                  value={row.targetRepMax}
                  onChange={(e) =>
                    updateItem(index, 'targetRepMax', e.target.value)
                  }
                  className="mt-1 w-full rounded border border-gray-300 p-2"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => removeItem(index)}
              className="text-sm text-red-600"
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={addItem}
          className="w-full rounded border border-dashed border-gray-400 p-2 text-sm"
        >
          Add movement
        </button>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full rounded bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save plan'}
      </button>
    </main>
  );
}