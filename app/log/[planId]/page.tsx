import { notFound } from 'next/navigation';
import { getPlan, getLastLoggedWeights, getLastSessionSets } from '@/lib/plans';
import { BASELINE_BY_ID, getExercise } from '@/lib/baseline';
import { evaluateProgression, computeNextWeight } from '@/lib/engine';
import { getLadder } from '@/lib/ladders';
import LogWorkoutClient, {
  type ExerciseInfo,
  type EngineSuggestion,
} from './LogWorkoutClient';

// Server Component: runs on the server only. It reads the route's planId, loads
// the plan + its ordered items and the last-logged weights from the database
// (server-only modules), runs the progression engine over each exercise's last
// session, then hands plain, serialisable props to the client.
//
// The engine runs HERE, not in the client: it depends on getLastSessionSets,
// which is part of the server-only @/lib/plans module. Doing it server-side
// keeps the database read and the pure decision together and ships the client
// only the conclusion (decision + suggested weight), never the raw history.
export default async function LogWorkoutPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;

  const plan = await getPlan(planId);
  if (!plan) notFound();

  const exerciseIds = plan.items.map((item) => item.exerciseId);

  // Last-logged weight per exercise (absent when there's no history yet).
  const lastLogged = await getLastLoggedWeights(exerciseIds);

  // Every set from each exercise's most recent session — what the engine needs
  // to judge a whole session, not just the latest weight.
  const lastSessions = await getLastSessionSets(exerciseIds);

  // Display info from the in-code catalog: name (for headings) + baseline seed
  // weight (the pre-fill fallback when an exercise has never been logged).
  const exerciseInfo: Record<string, ExerciseInfo> = {};
  for (const id of exerciseIds) {
    const ex = BASELINE_BY_ID[id];
    exerciseInfo[id] = { name: ex?.name ?? id, baselineKg: ex?.baselineKg ?? 0 };
  }

  // Run the engine per exercise. We only emit a suggestion when there's both an
  // exercise definition and logged history; absent either, the client falls
  // back to its existing last-weight / baseline pre-fill.
  const suggestions: Record<string, EngineSuggestion> = {};
  for (const id of exerciseIds) {
    const ex = getExercise(id);
    const sets = lastSessions.get(id) ?? [];
    if (!ex || sets.length === 0) continue;

    const progression = evaluateProgression(ex, sets);

    // Only resolve a concrete next weight when the lifter earned a progression.
    // Step up from the heaviest set of the last session (its working weight).
    // needs-ladder (dumbbell/pin with no availability ladder) and at-ceiling
    // both leave suggestedKg null, so the client falls back to the last weight.
    let suggestedKg: number | null = null;
    if (progression.decision === 'progress') {
      const currentWeightKg = Math.max(...sets.map((s) => s.weightKg));
      const next = computeNextWeight(ex, currentWeightKg, getLadder(ex));
      if (next.status === 'ok') suggestedKg = next.weightKg;
    }

    suggestions[id] = {
      decision: progression.decision,
      reason: progression.reason,
      suggestedKg,
    };
  }

  // A Map isn't a plain prop; flatten to a Record so it crosses the
  // server → client boundary cleanly.
  const lastWeights: Record<string, number> = Object.fromEntries(lastLogged);

  return (
    <LogWorkoutClient
      plan={plan}
      lastWeights={lastWeights}
      exerciseInfo={exerciseInfo}
      suggestions={suggestions}
    />
  );
}