-- Additive, non-destructive: the studio link is stored encrypted at rest.
-- The plaintext URL is never written to this database.

ALTER TABLE "Session"
  ADD COLUMN "sourceUrlEnc" TEXT,
  ADD COLUMN "sourceExpiresAt" TIMESTAMP(3);
