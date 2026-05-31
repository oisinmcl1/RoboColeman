'use server';

import { prisma } from '@/lib/prisma';

export type SaveMemoryInput = {
  content: string;
  // Optional bucket for the note, e.g. 'injury', 'goal', 'preference'.
  category?: string;
};

export async function saveMemory(
  content: string,
  category?: string,
): Promise<string> {
  const memory = await prisma.roboMemory.create({
    data: { content, category },
  });

  return memory.id;
}