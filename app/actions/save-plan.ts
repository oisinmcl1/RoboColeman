'use server';

import { prisma } from '@/lib/prisma';

// Contract between this action and any UI that calls it. The form is
// responsible for producing a value of this shape; the action trusts the
// shape and turns it into rows.
export type SavePlanItemInput = {
  exerciseId: string;
  targetSets?: number;
  targetRepMin?: number;
  targetRepMax?: number;
  targetWeightKg?: number;
};

export type SavePlanInput = {
  name: string;
  note?: string;
  items: SavePlanItemInput[];
};

export async function savePlan(input: SavePlanInput): Promise<string> {
  const plan = await prisma.plan.create({
    // One Plan row plus all of its PlanItem rows are written in a single
    // nested create. Prisma wraps this in one transaction, so either the
    // plan and every item land together or nothing does.
    data: {
      name: input.name,
      note: input.note,
      items: {
        create: input.items.map((item, index) => ({
          exerciseId: item.exerciseId,
          // `order` is derived from array position, not supplied by the
          // caller, so item ordering is whatever order the form sends.
          order: index,
          targetSets: item.targetSets,
          targetRepMin: item.targetRepMin,
          targetRepMax: item.targetRepMax,
          targetWeightKg: item.targetWeightKg,
        })),
      },
    },
  });

  return plan.id;
}