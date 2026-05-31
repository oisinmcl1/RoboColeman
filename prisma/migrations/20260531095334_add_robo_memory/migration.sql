-- CreateTable
CREATE TABLE "RoboMemory" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoboMemory_pkey" PRIMARY KEY ("id")
);
