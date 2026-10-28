-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "billingInterval" "BillingInterval" NOT NULL DEFAULT 'month';
