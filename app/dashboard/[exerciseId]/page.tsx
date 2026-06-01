import { getExerciseProgress } from '@/lib/dashboard';
import { getExercise } from '@/lib/baseline';
import ExerciseProgressChart from './ExerciseProgressChart';

// Server Component: runs on the server only. It reads the route's exerciseId,
// loads the exercise's logged history from the database (the server-only
// @/lib/dashboard module), looks up the display name from the in-code BASELINE
// catalog, then hands plain, serialisable props to the client chart.
//
// The DB read happens HERE so Prisma and DATABASE_URL never reach the browser;
// the client receives only the finished series, never query access.
export default async function ExerciseDashboardPage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const { exerciseId } = await params;

  const series = await getExerciseProgress(exerciseId);

  // Friendly title from the catalog; fall back to the raw id if the exercise
  // isn't in BASELINE (e.g. a stale link). The empty-data case is handled in
  // the chart, so an unknown id with no history still renders cleanly.
  const name = getExercise(exerciseId)?.name ?? exerciseId;

  return <ExerciseProgressChart name={name} series={series} />;
}