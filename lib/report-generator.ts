import { LandReport, ParcelData, CompProperty } from '@/types';
import { scoreComps, estimateValue } from './comps-engine';
import { getAdapterForCounty } from './adapters';
import { geocode } from './geocoding';
import { prisma } from './db';
import { randomUUID } from 'crypto';
import { normalizeQuery } from './query-normalize';

const CACHE_TTL_DAYS = 7;

export async function generateReport(
  query: string,
  acresOverride?: number,
  pricePerAcreOverride?: number
): Promise<LandReport> {
  const normalizedQuery = normalizeQuery(query);
  const normalizedAcres = Number.isFinite(acresOverride) && acresOverride && acresOverride > 0
    ? acresOverride
    : undefined;
  const normalizedPricePerAcre = Number.isFinite(pricePerAcreOverride) && pricePerAcreOverride && pricePerAcreOverride > 0
    ? pricePerAcreOverride
    : undefined;
  const cacheKeyParts = [normalizedQuery];
  if (normalizedAcres) cacheKeyParts.push(`acres:${normalizedAcres}`);
  if (normalizedPricePerAcre) cacheKeyParts.push(`ppa:${normalizedPricePerAcre}`);
  const cacheKey = cacheKeyParts.join('|');

  // Check report cache first
  const cachedReport = await prisma.reportCache.findFirst({
    where: {
      query: cacheKey.toLowerCase().trim(),
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (cachedReport) {
    const reportData = JSON.parse(cachedReport.reportData);
    return {
      ...reportData,
      createdAt: cachedReport.createdAt,
    };
  }

  // Step 1: Geocode the input (address or APN)
  const geocodeResult = await geocode(normalizedQuery);
  if (!geocodeResult) {
    throw new Error('Could not geocode the provided address or APN');
  }

  // Step 2: Determine if input is APN or address
  const isAPN = /^\d{2,}[-.]?\d{2,}[-.]?\d{2,}/.test(normalizedQuery.trim());
  const apn = isAPN ? normalizedQuery.trim() : undefined;
  const address = isAPN ? undefined : normalizedQuery.trim();

  // Step 3: Get appropriate adapter
  const county = geocodeResult.county || 'Unknown';
  const state = geocodeResult.state || 'Unknown';
  const adapter = getAdapterForCounty(county, state);

  // Step 4: Lookup parcel data
  let subject: ParcelData;
  try {
    const parcelData = await adapter.lookupParcel(apn, address, geocodeResult);
    if (!parcelData) {
      // Fallback to basic data from geocoding
      subject = {
        apn,
        address: address || geocodeResult.address,
        county,
        state,
        lat: geocodeResult.lat,
        lon: geocodeResult.lon,
        acres: normalizedAcres,
        pricePerAcreOverride: normalizedPricePerAcre,
        accessGuess: 'unknown',
        floodFlag: 'unknown',
        slopeFlag: 'unknown',
      };
    } else {
      subject = parcelData;
    }
  } catch (error) {
    console.error('Error looking up parcel:', error);
    // Fallback to basic data
    subject = {
      apn,
      address: address || geocodeResult.address,
      county,
      state,
      lat: geocodeResult.lat,
      lon: geocodeResult.lon,
      acres: normalizedAcres,
      pricePerAcreOverride: normalizedPricePerAcre,
      accessGuess: 'unknown',
      floodFlag: 'unknown',
      slopeFlag: 'unknown',
    };
  }

  if (normalizedAcres && !subject.acres) {
    subject = {
      ...subject,
      acres: normalizedAcres,
    };
  }
  if (normalizedPricePerAcre && !subject.pricePerAcreOverride) {
    subject = {
      ...subject,
      pricePerAcreOverride: normalizedPricePerAcre,
    };
  }

  // Step 5: Find comparable properties
  let comps: CompProperty[] = [];
  try {
    comps = await adapter.findComps(subject, 20); // Get extra for filtering
  } catch (error) {
    console.error('Error finding comps:', error);
    // Continue with empty comps - report will show no comps
  }

  // Step 6: Score and rank comps
  const scoredComps = scoreComps(subject, comps);

  // Step 7: Generate value estimate
  const estimate = estimateValue(scoredComps, subject.acres);

  // Step 8: Build verification checklist
  const verificationChecklist = {
    access: subject.accessGuess !== 'unknown',
    easements: false, // Would need to check county records
    utilities: false, // Would need to check utility providers
    restrictions: false, // Would need to check deed restrictions
    wetlands: false, // Would need to check USFWS data
  };

  // Step 9: Build sources list
  const sources = [
    `Geocoding: OpenStreetMap Nominatim`,
    `Adapter: ${adapter.name}`,
    subject.floodFlag === 'unknown' ? 'FEMA Flood Maps: https://msc.fema.gov/portal' : '',
    subject.slopeFlag === 'unknown' ? 'USGS Elevation Data: https://elevation.nationalmap.gov' : '',
  ].filter(Boolean) as string[];

  // Step 10: Create report
  const report: LandReport = {
    id: randomUUID(),
    query: normalizedQuery,
    subject,
    comps: scoredComps.slice(0, 12), // Top 12 comps
    estimate,
    verificationChecklist,
    sources,
    rawData: {
      geocodeResult,
      adapter: adapter.name,
      acresOverride: normalizedAcres,
      pricePerAcreOverride: normalizedPricePerAcre,
      totalCompsFound: comps.length,
    },
    createdAt: new Date(),
  };

  // Cache the report
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

  await prisma.reportCache.create({
    data: {
      query: cacheKey.toLowerCase().trim(),
      reportData: JSON.stringify(report),
      expiresAt,
    },
  });

  return report;
}
