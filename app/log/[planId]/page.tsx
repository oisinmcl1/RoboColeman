import { notFound } from 'next/navigation';
import { getPlan, getLastLoggedWeights } from '@/lib/plans';
import { BASELINE_BY_ID } from '@/lib/baseline';
import LogWorkoutClient, { type ExerciseInfo } from './LogWorkoutClient';

// Server Component: runs on the server only. It reads the route's planId, loads
// the plan + its ordered items and the last-logged weights from the database
// (server-only modules), then hands plain, serialisable props to the client.
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

  // Display info from the in-code catalog: name (for headings) + baseline seed
  // weight (the pre-fill fallback when an exercise has never been logged).
  const exerciseInfo: Record<string, ExerciseInfo> = {};
  for (const id of exerciseIds) {
    const ex = BASELINE_BY_ID[id];
    exerciseInfo[id] = { name: ex?.name ?? id, baselineKg: ex?.baselineKg ?? 0 };
  }

  // A Map isn't a plain prop; flatten to a Record so it crosses the
  // server → client boundary cleanly.
  const lastWeights: Record<string, number> = Object.fromEntries(lastLogged);

  return (
    <LogWorkoutClient
      plan={plan}
      lastWeights={lastWeights}
      exerciseInfo={exerciseInfo}
    />
  );
}