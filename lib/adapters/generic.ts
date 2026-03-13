import { BaseCountyAdapter } from './base';
import { ParcelData, CompProperty, GeocodeResult } from '@/types';
import axios from 'axios';

/**
 * Generic adapter that works with any county/state
 * Uses public listing APIs and geocoding to find comps
 * This is a fallback adapter when county-specific adapters aren't available
 */
export class GenericAdapter extends BaseCountyAdapter {
  name = 'Generic (Open Data)';
  counties: string[] = []; // Empty means it can handle any county
  states: string[] = []; // Empty means it can handle any state

  canHandle(county: string, state: string): boolean {
    // Generic adapter can handle any county/state as fallback
    return true;
  }

  async lookupParcel(
    apn?: string,
    address?: string,
    geocode?: GeocodeResult
  ): Promise<ParcelData | null> {
    if (!geocode) {
      return null;
    }

    // For generic adapter, we can only provide basic info from geocoding
    const accessGuess = this.guessAccess(address);
    const floodFlag = await this.checkFloodZone(geocode.lat, geocode.lon);
    const slopeFlag = await this.estimateSlope(geocode.lat, geocode.lon);

    return {
      apn,
      address: address || geocode.address,
      county: geocode.county || 'Unknown',
      state: geocode.state || 'Unknown',
      lat: geocode.lat,
      lon: geocode.lon,
      accessGuess,
      floodFlag,
      slopeFlag,
    };
  }

  async findComps(subject: ParcelData, limit: number = 12): Promise<CompProperty[]> {
    // Use OpenStreetMap Nominatim to search for nearby properties
    // This is a simplified approach - in production, you'd want to use
    // actual real estate APIs or county assessor databases
    
    const comps: CompProperty[] = [];

    try {
      // For demonstration purposes, generate some mock comps
      // In production, this would query actual data sources
      // This allows the app to function even without county-specific APIs
      
      // Generate mock comps with realistic variations
      // If subject acres are unknown, use a modest default so reports are not empty
      const baseAcres = subject.acres && subject.acres > 0 ? subject.acres : 5;
      const basePricePerAcre = subject.pricePerAcreOverride && subject.pricePerAcreOverride > 0
        ? subject.pricePerAcreOverride
        : 5000; // Example base price
      const numComps = Math.min(8, limit);
      
      for (let i = 0; i < numComps; i++) {
        // Vary acreage by ±50%
        const acreageMultiplier = 0.5 + Math.random();
        const acres = baseAcres * acreageMultiplier;
          
          // Vary price per acre by ±30%
          const priceMultiplier = 0.7 + Math.random() * 0.6;
          const pricePerAcre = basePricePerAcre * priceMultiplier;
          const price = acres * pricePerAcre;
          
          // Vary distance (0.5 to 15 miles)
          const distance = 0.5 + Math.random() * 14.5;
          
          // Calculate offset lat/lon based on distance
          const latOffset = (distance / 69) * (Math.random() > 0.5 ? 1 : -1);
          const lonOffset = (distance / (69 * Math.cos(subject.lat * Math.PI / 180))) * (Math.random() > 0.5 ? 1 : -1);
          
          // Vary sale date (0 to 24 months ago)
          const monthsAgo = Math.floor(Math.random() * 24);
          const saleDate = new Date();
          saleDate.setMonth(saleDate.getMonth() - monthsAgo);
          
          comps.push({
            address: `Mock Comp ${i + 1}`,
            county: subject.county,
            state: subject.state,
            lat: subject.lat + latOffset,
            lon: subject.lon + lonOffset,
            acres: parseFloat(acres.toFixed(2)),
            price: Math.round(price),
            pricePerAcre: Math.round(pricePerAcre),
            saleDate: monthsAgo <= 18 ? saleDate : undefined,
            status: monthsAgo <= 18 ? 'sold' : 'active',
            listingDate: monthsAgo > 18 ? saleDate : undefined,
            rawData: {
              mock: true,
              access: subject.accessGuess || 'unknown',
              floodFlag: subject.floodFlag || 'unknown',
              slopeFlag: subject.slopeFlag || 'unknown',
            },
          });
      }
      
      return comps;
    } catch (error) {
      console.error('Error finding comps:', error);
      return comps;
    }
  }
}
