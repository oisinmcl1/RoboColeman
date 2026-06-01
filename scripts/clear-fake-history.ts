// scripts/clear-fake-history.ts
// ───────────────────────────────────────────────────────────────────────────
// DEV-ONLY: wipe ALL fake training history before real use.
//
// Run with:
//   npx tsx --conditions=react-server --env-file=.env.local scripts/clear-fake-history.ts
//
// It deletes every Workout whose `note` STARTS WITH the literal marker "[SEED]"
// (their SetLogs cascade away with them) and reports how many it removed.
//
// SAFETY: the only rows this can ever match are ones some seed script branded
// with the leading "[SEED]" marker. A real, manually-logged workout has a null
// or human note that does NOT start with "[SEED]", so it can never be matched
// or deleted here. There is no path in this file that touches unmarked data.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';

// Must match the marker written by scripts/seed-fake-history.ts.
const SEED_MARKER = '[SEED]';

async function main() {
  // Count first so the report is accurate even though deleteMany also returns
  // a count — this makes the "nothing to remove" case explicit.
  const toRemove = await prisma.workout.count({
    where: { note: { startsWith: SEED_MARKER } },
  });

  if (toRemove === 0) {
    console.log(`No ${SEED_MARKER} workouts found — nothing to remove.`);
    return;
  }

  const { count } = await prisma.workout.deleteMany({
    where: { note: { startsWith: SEED_MARKER } },
  });

  console.log(`Removed ${count} ${SEED_MARKER} workout(s) (their set logs cascaded away).`);
}

main()
  .catch((err) => {
    console.error('Clear failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });