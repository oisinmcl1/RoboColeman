import { BASELINE, type Exercise, type ExerciseType } from "@/lib/baseline";

const GROUPS: { type: ExerciseType; label: string }[] = [
  { type: "barbell", label: "Barbell" },
  { type: "dumbbell", label: "Dumbbell" },
  { type: "plate-loaded", label: "Plate-loaded" },
  { type: "pin-machine", label: "Pin machine" },
];

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const { name, baselineKg, unit, repRange } = exercise;
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-zinc-200 py-2 dark:border-zinc-800">
      <span className="font-medium text-black dark:text-zinc-50">{name}</span>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">
        {baselineKg} kg{" "}
        <span className="text-zinc-400 dark:text-zinc-500">({unit})</span>
        {" · "}
        {repRange.min}–{repRange.max} reps
      </span>
    </li>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-10 text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
        Baseline Program
      </h1>
      <div className="flex flex-col gap-10">
        {GROUPS.map(({ type, label }) => {
          const exercises = BASELINE.filter((e) => e.type === type);
          if (exercises.length === 0) return null;
          return (
            <section key={type}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {label}
              </h2>
              <ul>
                {exercises.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </main>
  );
}