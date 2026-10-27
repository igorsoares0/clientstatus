-- Case-insensitive sort key for website names; backfilled from existing names.
ALTER TABLE "site" ADD COLUMN "nameKey" TEXT;
UPDATE "site" SET "nameKey" = lower("name");
ALTER TABLE "site" ALTER COLUMN "nameKey" SET NOT NULL;
