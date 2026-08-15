ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ModelAsset" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "ModelAsset" ADD CONSTRAINT "ModelAsset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ModelAsset_ownerId_idx" ON "ModelAsset"("ownerId");
CREATE INDEX "Project_userId_idx" ON "Project"("userId");
CREATE INDEX "UserPreset_userId_idx" ON "UserPreset"("userId");
ALTER TABLE "ModelVersion" DROP CONSTRAINT IF EXISTS "ModelVersion_projectId_fkey";
ALTER TABLE "ModelVersion" ADD CONSTRAINT "ModelVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
