CREATE TABLE "AIRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT,
  "status" TEXT NOT NULL,
  "inputJson" JSONB NOT NULL,
  "resultJson" JSONB,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AIRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AIRequest_userId_createdAt_idx" ON "AIRequest"("userId","createdAt");
CREATE INDEX "AIRequest_projectId_idx" ON "AIRequest"("projectId");
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIRequest" ADD CONSTRAINT "AIRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ManufacturingCheck" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "modelVersionId" TEXT,
  "configurationJson" JSONB NOT NULL,
  "issuesJson" JSONB NOT NULL,
  "geometryJson" JSONB,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManufacturingCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ManufacturingCheck_userId_idx" ON "ManufacturingCheck"("userId");
CREATE INDEX "ManufacturingCheck_projectId_idx" ON "ManufacturingCheck"("projectId");
ALTER TABLE "ManufacturingCheck" ADD CONSTRAINT "ManufacturingCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ManufacturingCheck" ADD CONSTRAINT "ManufacturingCheck_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
