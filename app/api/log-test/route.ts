import { NextResponse } from 'next/server';
import { saveWorkout } from '@/app/actions/log-workout';

// Temporary smoke-test endpoint for saveWorkout. Safe to delete.
export async function GET() {
  try {
    const id = await saveWorkout({
      note: 'log-test smoke test',
      exercises: [
        {
          exerciseId: 'squat',
          sets: [
            { weightKg: 100, reps: 5, rpe: 8 },
            { weightKg: 100, reps: 5, rpe: 8.5 },
          ],
        },
      ],
    });

    return NextResponse.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}