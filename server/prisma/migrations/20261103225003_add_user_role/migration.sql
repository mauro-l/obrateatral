-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" TEXT NOT NULL DEFAULT 'member';


-- Bootstrap admin: the first account manages users from the web.
UPDATE "User" SET "role" = 'admin' WHERE "name" = 'mauro';
