-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "planId" TEXT;

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "targetSets" INTEGER,
    "targetRepMin" INTEGER,
    "targetRepMax" INTEGER,
    "targetWeightKg" DOUBLE PRECISION,

    CONSTRAINT "PlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanItem_planId_idx" ON "PlanItem"("planId");

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanItem" ADD CONSTRAINT "PlanItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
