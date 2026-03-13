import { CountyAdapter, ParcelData, CompProperty, GeocodeResult } from '@/types';

export abstract class BaseCountyAdapter implements CountyAdapter {
  abstract name: string;
  abstract counties: string[];
  abstract states: string[];

  canHandle(county: string, state: string): boolean {
    const normalizedCounty = county.toLowerCase().trim();
    const normalizedState = state.toLowerCase().trim();
    return (
      this.counties.some(c => c.toLowerCase() === normalizedCounty) &&
      this.states.some(s => s.toLowerCase() === normalizedState)
    );
  }

  abstract lookupParcel(
    apn?: string,
    address?: string,
    geocode?: GeocodeResult
  ): Promise<ParcelData | null>;

  abstract findComps(subject: ParcelData, limit?: number): Promise<CompProperty[]>;

  // Helper method to estimate access from address/parcel data
  protected guessAccess(address?: string, apn?: string): string {
    // Simple heuristic: if address contains road names, likely has access
    if (address) {
      const roadKeywords = ['road', 'street', 'highway', 'route', 'lane', 'drive', 'ave', 'blvd'];
      if (roadKeywords.some(keyword => address.toLowerCase().includes(keyword))) {
        return 'road_access';
      }
    }
    return 'unknown';
  }

  // Helper method to check flood zone (placeholder - would integrate with FEMA API)
  protected async checkFloodZone(lat: number, lon: number): Promise<'yes' | 'no' | 'unknown'> {
    // TODO: Integrate with FEMA flood hazard layer
    // For now, return unknown
    return 'unknown';
  }

  // Helper method to estimate slope (placeholder - would use USGS elevation data)
  protected async estimateSlope(lat: number, lon: number): Promise<'steep' | 'moderate' | 'flat' | 'unknown'> {
    // TODO: Integrate with USGS elevation tiles
    // For now, return unknown
    return 'unknown';
  }
}
