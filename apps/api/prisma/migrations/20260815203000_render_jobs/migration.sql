CREATE TABLE "RenderJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "sourceExportJobId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "quality" TEXT NOT NULL,
  "frameCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RenderJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RenderJob_jobId_key" ON "RenderJob"("jobId");
CREATE INDEX "RenderJob_userId_idx" ON "RenderJob"("userId");
CREATE INDEX "RenderJob_projectId_idx" ON "RenderJob"("projectId");

ALTER TABLE "RenderJob"
  ADD CONSTRAINT "RenderJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RenderJob"
  ADD CONSTRAINT "RenderJob_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RenderJob"
  ADD CONSTRAINT "RenderJob_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
