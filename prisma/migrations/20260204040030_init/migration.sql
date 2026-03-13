-- CreateTable
CREATE TABLE "GeocodeCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "address" TEXT,
    "county" TEXT,
    "state" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ParcelCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apn" TEXT,
    "address" TEXT,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "acres" REAL,
    "zoning" TEXT,
    "landUse" TEXT,
    "accessGuess" TEXT,
    "floodFlag" TEXT,
    "slopeFlag" TEXT,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "parcelId" TEXT NOT NULL,
    "apn" TEXT,
    "address" TEXT,
    "county" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lon" REAL NOT NULL,
    "acres" REAL NOT NULL,
    "price" REAL NOT NULL,
    "pricePerAcre" REAL NOT NULL,
    "saleDate" DATETIME,
    "listingDate" DATETIME,
    "status" TEXT NOT NULL,
    "distance" REAL,
    "rawData" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReportCache" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "reportData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "GeocodeCache_query_key" ON "GeocodeCache"("query");

-- CreateIndex
CREATE INDEX "GeocodeCache_expiresAt_idx" ON "GeocodeCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ParcelCache_apn_idx" ON "ParcelCache"("apn");

-- CreateIndex
CREATE INDEX "ParcelCache_address_idx" ON "ParcelCache"("address");

-- CreateIndex
CREATE INDEX "ParcelCache_county_state_idx" ON "ParcelCache"("county", "state");

-- CreateIndex
CREATE INDEX "ParcelCache_expiresAt_idx" ON "ParcelCache"("expiresAt");

-- CreateIndex
CREATE INDEX "CompCache_parcelId_idx" ON "CompCache"("parcelId");

-- CreateIndex
CREATE INDEX "CompCache_county_state_idx" ON "CompCache"("county", "state");

-- CreateIndex
CREATE INDEX "CompCache_expiresAt_idx" ON "CompCache"("expiresAt");

-- CreateIndex
CREATE INDEX "ReportCache_query_idx" ON "ReportCache"("query");

-- CreateIndex
CREATE INDEX "ReportCache_expiresAt_idx" ON "ReportCache"("expiresAt");
