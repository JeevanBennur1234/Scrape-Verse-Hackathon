-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('SCHEMA_DRIFT', 'NULL_SPIKE', 'PRICE_OUTLIER');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('DETECTED', 'HEALING', 'GRADED', 'RECOVERED', 'ESCALATED');

-- CreateTable
CREATE TABLE "Collector" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "portalUrl" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'IDLE',
    "lastGoodSelectors" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',

    CONSTRAINT "Collector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceTick" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "commodity" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "modalPrice" DOUBLE PRECISION NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "arrivalQty" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceTick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "type" "IncidentType" NOT NULL,
    "field" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "affectedRatio" DOUBLE PRECISION NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'DETECTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "checks" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Collector_name_idx" ON "Collector"("name");

-- CreateIndex
CREATE INDEX "PriceTick_collectorId_recordedAt_idx" ON "PriceTick"("collectorId", "recordedAt");

-- CreateIndex
CREATE INDEX "PriceTick_commodity_market_idx" ON "PriceTick"("commodity", "market");

-- CreateIndex
CREATE INDEX "Incident_collectorId_createdAt_idx" ON "Incident"("collectorId", "createdAt");

-- CreateIndex
CREATE INDEX "Incident_status_idx" ON "Incident"("status");

-- CreateIndex
CREATE INDEX "Grade_incidentId_idx" ON "Grade"("incidentId");

-- AddForeignKey
ALTER TABLE "PriceTick" ADD CONSTRAINT "PriceTick_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "Collector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "Collector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grade" ADD CONSTRAINT "Grade_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;
