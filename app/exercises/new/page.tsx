'use client';

import { useState } from 'react';
import {
  proposeExerciseAction,
  type ProposeExerciseResult,
} from '@/app/actions/propose-exercise';
import { saveExercise } from '@/app/actions/save-exercise';
import { type Exercise } from '@/lib/exercise-schema';

// The fixed option lists for the editable dropdowns. These mirror the enums in
// @/lib/exercise-schema; the server re-validates against those on save, so a
// stale option here would simply be rejected rather than silently stored.
const TYPE_OPTIONS: Exercise['type'][] = [
  'barbell',
  'dumbbell',
  'plate-loaded',
  'pin-machine',
];
const SCOPE_OPTIONS: Exercise['scope'][] = ['universal', 'home-only'];
const UNIT_OPTIONS: Exercise['unit'][] = ['total', 'per-side', 'per-hand', 'stack'];

export default function NewExercisePage() {
  // ── Propose phase state ────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [hint, setHint] = useState('');
  const [proposing, setProposing] = useState(false);
  const [proposeError, setProposeError] = useState<string | null>(null);

  // ── Edit/approve phase state ───────────────────────────────────────────────
  // The editable proposal. Null until Robo returns a valid exercise; from then
  // on it is the single source of truth for the form, fully owned by the user.
  const [proposal, setProposal] = useState<Exercise | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  // Ask Robo to propose an exercise. On ok:true we drop into the edit phase with
  // his values pre-filled; on ok:false we surface the validation error and stay
  // on the propose form so the user can adjust the name/hint and retry.
  const handlePropose = async () => {
    setProposing(true);
    setProposeError(null);
    setProposal(null);
    setSavedId(null);
    setSaveError(null);

    try {
      const result: ProposeExerciseResult = await proposeExerciseAction(
        name.trim(),
        hint.trim() || undefined,
      );
      if (result.ok) {
        setProposal(result.exercise);
      } else {
        setProposeError(result.error);
      }
    } catch (e) {
      setProposeError(e instanceof Error ? e.message : 'Failed to reach Robo');
    } finally {
      setProposing(false);
    }
  };

  // Patch a single field on the editable proposal. Everything else passes
  // through unchanged. baselineKg is deliberately never editable here.
  const updateField = <K extends keyof Exercise>(field: K, value: Exercise[K]) =>
    setProposal((prev) => (prev ? { ...prev, [field]: value } : prev));

  const handleSave = async () => {
    if (!proposal) return;
    setSaving(true);
    setSaveError(null);
    setSavedId(null);

    try {
      // The edited exercise is sent as-is; the saveExercise action re-validates
      // it with Zod before it touches the DB, so client-side edits are never
      // trusted blindly.
      const id = await saveExercise(proposal);
      setSavedId(id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save exercise');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="text-xl font-semibold">New exercise with Robo</h1>

      {/* ── Propose form ──────────────────────────────────────────────────── */}
      <div className="space-y-3 rounded border border-gray-200 p-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Movement name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Bulgarian Split Squat"
            className="mt-1 w-full rounded border border-gray-300 p-2"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Hint (optional)</span>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="e.g. dumbbells held at sides, home gym"
            className="mt-1 w-full rounded border border-gray-300 p-2"
          />
        </label>
        <button
          type="button"
          onClick={handlePropose}
          disabled={proposing || name.trim() === ''}
          className="w-full rounded bg-blue-600 p-3 font-medium text-white disabled:opacity-50"
        >
          {proposing ? 'Robo is thinking…' : 'Propose with Robo'}
        </button>
      </div>

      {proposeError && (
        <div className="rounded bg-red-100 p-3 text-sm text-red-800">
          <p className="font-medium">Robo’s proposal didn’t validate:</p>
          <pre className="mt-1 whitespace-pre-wrap break-words text-xs">
            {proposeError}
          </pre>
          <p className="mt-2">Tweak the name or hint and try again.</p>
        </div>
      )}

      {/* ── Editable proposal ─────────────────────────────────────────────── */}
      {proposal && (
        <div className="space-y-4 rounded border border-gray-200 p-3">
          <h2 className="font-medium">Robo proposed this — edit anything</h2>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Name</span>
            <input
              type="text"
              value={proposal.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Type</span>
            <select
              value={proposal.type}
              onChange={(e) =>
                updateField('type', e.target.value as Exercise['type'])
              }
              className="mt-1 w-full rounded border border-gray-300 bg-white p-2"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Scope</span>
            <select
              value={proposal.scope}
              onChange={(e) =>
                updateField('scope', e.target.value as Exercise['scope'])
              }
              className="mt-1 w-full rounded border border-gray-300 bg-white p-2"
            >
              {SCOPE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Rep range — the field users most often adjust to their own
              conventions. Held as the proposal's numbers; empty parses to 0. */}
          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="text-xs font-medium text-gray-600">Rep min</span>
              <input
                type="number"
                inputMode="numeric"
                value={proposal.repRange.min}
                onChange={(e) =>
                  updateField('repRange', {
                    ...proposal.repRange,
                    min: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
            <label className="block flex-1">
              <span className="text-xs font-medium text-gray-600">Rep max</span>
              <input
                type="number"
                inputMode="numeric"
                value={proposal.repRange.max}
                onChange={(e) =>
                  updateField('repRange', {
                    ...proposal.repRange,
                    max: Number(e.target.value),
                  })
                }
                className="mt-1 w-full rounded border border-gray-300 p-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">Unit</span>
            <select
              value={proposal.unit}
              onChange={(e) =>
                updateField('unit', e.target.value as Exercise['unit'])
              }
              className="mt-1 w-full rounded border border-gray-300 bg-white p-2"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>

          {/* Increment is read-only for now — just show its kind. */}
          <div>
            <span className="text-xs font-medium text-gray-600">
              Increment (read-only)
            </span>
            <p className="mt-1 rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-700">
              {proposal.increment.kind}
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-gray-600">
              Notes (optional)
            </span>
            <textarea
              value={proposal.notes ?? ''}
              onChange={(e) =>
                updateField('notes', e.target.value || undefined)
              }
              rows={2}
              className="mt-1 w-full rounded border border-gray-300 p-2"
            />
          </label>

          {/* baselineKg is intentionally not shown or editable — it stays 0.
              The real starting weight comes from the lifter's first logged set. */}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded bg-green-600 p-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Approve & Save'}
          </button>
        </div>
      )}

      {savedId && (
        <p className="rounded bg-green-100 p-3 text-sm text-green-800">
          Saved! Exercise id: <span className="font-mono">{savedId}</span>
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