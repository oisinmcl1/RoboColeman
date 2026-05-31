-- CreateTable
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "repRangeMin" INTEGER NOT NULL,
    "repRangeMax" INTEGER NOT NULL,
    "increment" JSONB NOT NULL,
    "baselineKg" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "parked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);
