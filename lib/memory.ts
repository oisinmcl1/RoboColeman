// memory.ts
// ───────────────────────────────────────────────────────────────────────────
// Robo's long-term memory — durable notes about the lifter (injuries, goals,
// preferences) that should colour every conversation.
//
// This is server-only. Reading memories goes through the Prisma client, which
// holds the database credentials and connection pool; pulling any of that into
// the browser would leak secrets and ship server code to the client. Importing
// `server-only` first turns an accidental client import into a build error
// rather than a runtime leak. (lib/prisma.ts enforces the same guard, so this
// is belt-and-braces — but the firewall belongs at every server boundary.)
// ───────────────────────────────────────────────────────────────────────────

import 'server-only';

import { prisma } from '@/lib/prisma';

/**
 * All stored memories, newest first.
 *
 * Ordering by `createdAt` descending means the most recently captured facts
 * lead — handy both for display and for prompt construction, where the freshest
 * context tends to matter most.
 */
export async function getMemories() {
  return prisma.roboMemory.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Render the stored memories as a single plain-text block for prompt injection.
 *
 * Each memory becomes one line, prefixed with its category when present, e.g.
 *   [injury] Left shoulder impingement — avoid overhead pressing
 *   [goal] Wants to hit a 180kg deadlift by summer
 *   Prefers training in the early morning
 *
 * Returns an empty string when there are no memories, so callers can cheaply
 * decide whether to include a memory section at all.
 */
export async function formatMemoriesForContext(): Promise<string> {
  const memories = await getMemories();

  if (memories.length === 0) {
    return '';
  }

  return memories
    .map((memory) =>
      memory.category
        ? `[${memory.category}] ${memory.content}`
        : memory.content,
    )
    .join('\n');
}