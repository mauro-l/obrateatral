-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_playId_fkey";

-- DropForeignKey
ALTER TABLE "WatchProgress" DROP CONSTRAINT "WatchProgress_playId_fkey";

-- DropForeignKey
ALTER TABLE "WatchProgress" DROP CONSTRAINT "WatchProgress_userId_fkey";

-- DropTable
DROP TABLE "Play";

-- DropTable
DROP TABLE "Room";

-- DropTable
DROP TABLE "WatchProgress";

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "positionSeconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

