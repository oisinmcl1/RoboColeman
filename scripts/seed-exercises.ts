// scripts/seed-exercises.ts
// ───────────────────────────────────────────────────────────────────────────
// One-off seed: copy the in-code BASELINE catalog into the Exercise table.
//
// Run with:
//   npx tsx scripts/seed-exercises.ts
//
// Idempotent — it UPSERTs by id, so re-running updates the existing rows in
// place rather than creating duplicates (the ids are the stable baseline keys,
// e.g. 'squat', not generated cuids).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { BASELINE } from '@/lib/baseline';

async function main() {
  for (const exercise of BASELINE) {
    // Flatten the nested shape into the DB columns:
    //   - repRange  → repRangeMin / repRangeMax
    //   - increment → stored whole as JSON
    //   - hevyTemplateId is dropped (no such column; not pulled out below)
    const { id, name, type, scope, repRange, increment, baselineKg, unit } = exercise;

    const data = {
      name,
      type,
      scope,
      repRangeMin: repRange.min,
      repRangeMax: repRange.max,
      // increment is a readonly discriminated-union object; Prisma's Json input
      // wants a plain mutable value, so clone-and-cast it on the way in.
      increment: structuredClone(increment) as object,
      baselineKg,
      unit,
      parked: exercise.parked ?? false,
      notes: exercise.notes ?? null,
    };

    await prisma.exercise.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });

    console.log(`✓ upserted ${id}`);
  }

  const count = await prisma.exercise.count();
  console.log(`\nDone. Exercise table now holds ${count} rows.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });