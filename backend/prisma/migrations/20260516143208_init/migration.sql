-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'DEPO', 'OPERATOR', 'ACCOUNTING');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('MARKET_INVOICE', 'MARKET_PAYMENT', 'MARKET_ADJUSTMENT', 'PRODUCER_DEBT', 'PRODUCER_PAYMENT', 'PRODUCER_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "CaseMovementType" AS ENUM ('MARKET_OUT', 'MARKET_IN', 'MARKET_INIT', 'MARKET_ADJUST', 'DRIVER_OUT', 'DRIVER_IN', 'DRIVER_INIT', 'DRIVER_ADJUST');

-- CreateTable
CREATE TABLE "Driver" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Producer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "driverId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Producer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleSession" (
    "id" SERIAL NOT NULL,
    "driverId" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VehicleSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quality" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Quality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Market" (
    "id" SERIAL NOT NULL,
    "no" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entry" (
    "id" SERIAL NOT NULL,
    "vehicleSessionId" INTEGER NOT NULL,
    "productId" INTEGER NOT NULL,
    "producerId" INTEGER,
    "qualityId" INTEGER,
    "caseCount" INTEGER NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "weak" BOOLEAN NOT NULL DEFAULT false,
    "marketId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exit" (
    "id" SERIAL NOT NULL,
    "marketId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,

    CONSTRAINT "Exit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExitItem" (
    "id" SERIAL NOT NULL,
    "exitId" INTEGER NOT NULL,
    "entryId" INTEGER NOT NULL,
    "loaded" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ExitItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Price" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "qualityId" INTEGER NOT NULL,
    "pricePerKg" DOUBLE PRECISION NOT NULL,
    "date" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy" TEXT,

    CONSTRAINT "Price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" SERIAL NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "marketId" INTEGER,
    "producerId" INTEGER,
    "exitId" INTEGER,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseMovement" (
    "id" SERIAL NOT NULL,
    "type" "CaseMovementType" NOT NULL,
    "qty" INTEGER NOT NULL,
    "marketId" INTEGER,
    "driverId" INTEGER,
    "exitId" INTEGER,
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "CaseMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "passwordHash" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'OPERATOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" SERIAL NOT NULL,
    "entryId" INTEGER NOT NULL,
    "fromMarketId" INTEGER NOT NULL,
    "toMarketId" INTEGER NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Producer_driverId_idx" ON "Producer"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_name_key" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Quality_name_key" ON "Quality"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Market_no_key" ON "Market"("no");

-- CreateIndex
CREATE UNIQUE INDEX "ExitItem_exitId_entryId_key" ON "ExitItem"("exitId", "entryId");

-- CreateIndex
CREATE UNIQUE INDEX "Price_productId_qualityId_date_key" ON "Price"("productId", "qualityId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LedgerEntry_exitId_key" ON "LedgerEntry"("exitId");

-- CreateIndex
CREATE INDEX "LedgerEntry_marketId_occurredAt_idx" ON "LedgerEntry"("marketId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_producerId_occurredAt_idx" ON "LedgerEntry"("producerId", "occurredAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_type_occurredAt_idx" ON "LedgerEntry"("type", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "CaseMovement_exitId_key" ON "CaseMovement"("exitId");

-- CreateIndex
CREATE INDEX "CaseMovement_marketId_occurredAt_idx" ON "CaseMovement"("marketId", "occurredAt");

-- CreateIndex
CREATE INDEX "CaseMovement_driverId_occurredAt_idx" ON "CaseMovement"("driverId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "Transfer_entryId_idx" ON "Transfer"("entryId");

-- CreateIndex
CREATE INDEX "Transfer_fromMarketId_createdAt_idx" ON "Transfer"("fromMarketId", "createdAt");

-- CreateIndex
CREATE INDEX "Transfer_toMarketId_createdAt_idx" ON "Transfer"("toMarketId", "createdAt");

-- AddForeignKey
ALTER TABLE "Producer" ADD CONSTRAINT "Producer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleSession" ADD CONSTRAINT "VehicleSession_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_vehicleSessionId_fkey" FOREIGN KEY ("vehicleSessionId") REFERENCES "VehicleSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_qualityId_fkey" FOREIGN KEY ("qualityId") REFERENCES "Quality"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exit" ADD CONSTRAINT "Exit_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitItem" ADD CONSTRAINT "ExitItem_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "Exit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExitItem" ADD CONSTRAINT "ExitItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Price" ADD CONSTRAINT "Price_qualityId_fkey" FOREIGN KEY ("qualityId") REFERENCES "Quality"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "Producer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "Exit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseMovement" ADD CONSTRAINT "CaseMovement_exitId_fkey" FOREIGN KEY ("exitId") REFERENCES "Exit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromMarketId_fkey" FOREIGN KEY ("fromMarketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toMarketId_fkey" FOREIGN KEY ("toMarketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

