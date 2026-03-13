import axios from 'axios';
import { prisma } from './db';
import { GeocodeResult } from '@/types';

const CACHE_TTL_DAYS = 7;

export async function geocode(query: string): Promise<GeocodeResult | null> {
  // Check cache first
  const cached = await prisma.geocodeCache.findUnique({
    where: { query: query.toLowerCase().trim() },
  });

  if (cached && cached.expiresAt > new Date()) {
    return {
      lat: cached.lat,
      lon: cached.lon,
      address: cached.address || undefined,
      county: cached.county || undefined,
      state: cached.state || undefined,
    };
  }

  // Clean expired cache entries
  await prisma.geocodeCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  try {
    const candidateQueries = buildGeocodeCandidates(query);
    let result: any | null = null;

    for (const candidate of candidateQueries) {
      // Use Nominatim (OpenStreetMap) geocoding
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: candidate,
          format: 'json',
          addressdetails: 1,
          limit: 1,
          countrycodes: 'us',
        },
        headers: {
          'User-Agent': 'LandCompsApp/1.0',
        },
      });

      if (response.data && response.data.length > 0) {
        result = response.data[0];
        break;
      }

      // Rate limiting: Nominatim requires max 1 request per second
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (!result) {
      const censusResult = await geocodeWithCensus(candidateQueries);
      if (!censusResult) {
        return null;
      }

      result = censusResult;
    }
    const geocodeResult: GeocodeResult = {
      lat: parseFloat(result.lat),
      lon: parseFloat(result.lon),
      address: result.display_name || result.formatted_address || result.matchAddress,
      county: result.address?.county || result.address?.state_district || result.county,
      state: result.address?.state || result.address?.state_code || result.state,
    };

    // Cache the result
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + CACHE_TTL_DAYS);

    await prisma.geocodeCache.upsert({
      where: { query: query.toLowerCase().trim() },
      create: {
        query: query.toLowerCase().trim(),
        lat: geocodeResult.lat,
        lon: geocodeResult.lon,
        address: geocodeResult.address,
        county: geocodeResult.county,
        state: geocodeResult.state,
        expiresAt,
      },
      update: {
        lat: geocodeResult.lat,
        lon: geocodeResult.lon,
        address: geocodeResult.address,
        county: geocodeResult.county,
        state: geocodeResult.state,
        expiresAt,
      },
    });

    return geocodeResult;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

function buildGeocodeCandidates(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const candidates = new Set<string>();
  candidates.add(trimmed);

  const withoutLeadingZero = trimmed.replace(/^\s*0+\s+/, '');
  if (withoutLeadingZero !== trimmed) {
    candidates.add(withoutLeadingZero);
  }

  const stateZipMatch = trimmed.match(/^(.*)\s+([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/i);
  if (stateZipMatch) {
    const beforeState = stateZipMatch[1].trim();
    const state = stateZipMatch[2].toUpperCase();
    const zip = stateZipMatch[3];
    const split = splitStreetAndCity(beforeState);
    const cityFromCommas = extractCityFromCommas(beforeState);

    if (split) {
      candidates.add(`${split.street}, ${split.city}, ${state} ${zip}`);
      candidates.add(`${split.city}, ${state} ${zip}`);
    }

    candidates.add(`${beforeState}, ${state} ${zip}`);
    if (cityFromCommas) {
      candidates.add(`${cityFromCommas}, ${state} ${zip}`);
    }
    if (withoutLeadingZero !== trimmed) {
      const cleanedBeforeState = withoutLeadingZero.replace(/\s+[A-Z]{2}\s+\d{5}.*$/i, '').trim();
      if (cleanedBeforeState) {
        const cleanedSplit = splitStreetAndCity(cleanedBeforeState);
        const cleanedCityFromCommas = extractCityFromCommas(cleanedBeforeState);
        if (cleanedSplit) {
          candidates.add(`${cleanedSplit.street}, ${cleanedSplit.city}, ${state} ${zip}`);
          candidates.add(`${cleanedSplit.city}, ${state} ${zip}`);
        }
        candidates.add(`${cleanedBeforeState}, ${state} ${zip}`);
        if (cleanedCityFromCommas) {
          candidates.add(`${cleanedCityFromCommas}, ${state} ${zip}`);
        }
      }
    }
  }

  // Try adding country context as a fallback
  candidates.add(`${trimmed}, USA`);

  return Array.from(candidates);
}

function splitStreetAndCity(value: string): { street: string; city: string } | null {
  const suffixes = [
    'rd', 'road', 'st', 'street', 'ave', 'avenue', 'ln', 'lane', 'dr', 'drive',
    'blvd', 'boulevard', 'ct', 'court', 'way', 'hwy', 'highway', 'route'
  ];

  const suffixPattern = new RegExp(`\\b(${suffixes.join('|')})\\b`, 'i');
  const match = value.match(suffixPattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const suffixIndex = match.index + match[0].length;
  const street = value.slice(0, suffixIndex).trim();
  const city = value.slice(suffixIndex).trim();

  if (!street || !city) {
    return null;
  }

  return { street, city };
}

function extractCityFromCommas(value: string): string | null {
  const parts = value.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return null;
}

async function geocodeWithCensus(candidates: string[]): Promise<any | null> {
  for (const candidate of candidates) {
    try {
      const response = await axios.get('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress', {
        params: {
          address: candidate,
          benchmark: '2020',
          format: 'json',
        },
      });

      const match = response.data?.result?.addressMatches?.[0];
      if (match?.coordinates) {
        return {
          lat: match.coordinates.y,
          lon: match.coordinates.x,
          formatted_address: match.matchedAddress,
          county: match.addressComponents?.county,
          state: match.addressComponents?.state,
          matchAddress: match.matchedAddress,
        };
      }
    } catch (error) {
      // Continue to next candidate
    }
  }

  return null;
}

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // Haversine formula to calculate distance in miles
  const R = 3959; // Earth's radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
