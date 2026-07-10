-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Chain" AS ENUM ('ETHEREUM', 'BASE', 'ARBITRUM', 'OPTIMISM', 'POLYGON', 'BNB', 'SOLANA');

-- CreateEnum
CREATE TYPE "ClaimableCategory" AS ENUM ('AIRDROP', 'STAKING_REWARD', 'VESTING', 'PRESALE_ALLOCATION', 'GOVERNANCE_REWARD', 'NFT_CLAIM', 'REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('QUEUED', 'RUNNING', 'PARTIAL', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "Confidence" AS ENUM ('CONFIRMED', 'LIKELY', 'ESTIMATED');

-- CreateTable
CREATE TABLE "connectors" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "category" "ClaimableCategory" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scans" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "ScanStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claimables" (
    "id" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chain" "Chain" NOT NULL,
    "category" "ClaimableCategory" NOT NULL,
    "tokenSymbol" TEXT NOT NULL,
    "tokenName" TEXT NOT NULL,
    "tokenDecimals" INTEGER NOT NULL,
    "tokenContractAddress" TEXT,
    "amountRaw" DECIMAL(78,0) NOT NULL,
    "amountDecimal" DECIMAL(38,18) NOT NULL,
    "usdValue" DECIMAL(38,2),
    "claimUrl" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "confidence" "Confidence" NOT NULL,
    "riskFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawPayload" JSONB,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claimables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "scans_address_createdAt_idx" ON "scans"("address", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "claimables_scanId_idx" ON "claimables"("scanId");

-- CreateIndex
CREATE INDEX "claimables_address_chain_idx" ON "claimables"("address", "chain");

-- AddForeignKey
ALTER TABLE "claimables" ADD CONSTRAINT "claimables_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claimables" ADD CONSTRAINT "claimables_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "connectors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

