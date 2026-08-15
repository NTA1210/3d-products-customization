ALTER TABLE "ModelAsset"
  ADD COLUMN "contentType" TEXT,
  ADD COLUMN "sizeBytes" INTEGER,
  ADD COLUMN "sourceObjectKey" TEXT,
  ADD COLUMN "normalizedObjectKey" TEXT,
  ADD COLUMN "validationJson" JSONB,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ModelAsset" ALTER COLUMN "status" SET DEFAULT 'AWAITING_UPLOAD';

ALTER TABLE "Job"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "bullmqJobId" TEXT,
  ADD COLUMN "modelAssetId" TEXT;

CREATE UNIQUE INDEX "Job_bullmqJobId_key" ON "Job"("bullmqJobId");

ALTER TABLE "Job"
  ADD CONSTRAINT "Job_modelAssetId_fkey"
  FOREIGN KEY ("modelAssetId") REFERENCES "ModelAsset"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
