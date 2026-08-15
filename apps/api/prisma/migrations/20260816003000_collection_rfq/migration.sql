CREATE TABLE "CollectionProduct" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "styleTags" TEXT[] NOT NULL,
  "materialTags" TEXT[] NOT NULL,
  "colorFamily" TEXT,
  "componentFeatures" TEXT[] NOT NULL,
  "thumbnailUrl" TEXT,
  "metadataJson" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectionProduct_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CollectionProduct_category_idx" ON "CollectionProduct"("category");

CREATE TABLE "Workshop" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactJson" JSONB NOT NULL,
  "capabilitiesJson" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "modelVersionId" TEXT NOT NULL,
  "workshopId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "customerNote" TEXT,
  "payloadJson" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteRequest_userId_idx" ON "QuoteRequest"("userId");
CREATE INDEX "QuoteRequest_projectId_idx" ON "QuoteRequest"("projectId");
CREATE INDEX "QuoteRequest_workshopId_idx" ON "QuoteRequest"("workshopId");

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "quoteRequestId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "amountCents" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "leadTimeDays" INTEGER,
  "terms" TEXT,
  "responseJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Quote_quoteRequestId_idx" ON "Quote"("quoteRequestId");

ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_modelVersionId_fkey" FOREIGN KEY ("modelVersionId") REFERENCES "ModelVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteRequest" ADD CONSTRAINT "QuoteRequest_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_quoteRequestId_fkey" FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
