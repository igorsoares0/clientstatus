-- AlterTable
ALTER TABLE "email_delivery" ADD COLUMN     "linkTokenSealed" TEXT;

-- Report emails used to store the private link token in plain text. Remove it
-- from everything already handed to the provider; queued ones still need it.
UPDATE "email_delivery"
SET "textBody" = regexp_replace("textBody", '/r/[A-Za-z0-9_-]{43}', '/r/[removed]', 'g'),
    "htmlBody" = regexp_replace("htmlBody", '/r/[A-Za-z0-9_-]{43}', '/r/[removed]', 'g')
WHERE "templateType" = 'report' AND "status" <> 'pending';
