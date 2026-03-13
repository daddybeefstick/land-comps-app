// Core types for the land comps application

export interface GeocodeResult {
  lat: number;
  lon: number;
  address?: string;
  county?: string;
  state?: string;
}

export interface ParcelData {
  apn?: string;
  address?: string;
  county: string;
  state: string;
  lat: number;
  lon: number;
  acres?: number;
  pricePerAcreOverride?: number;
  zoning?: string;
  landUse?: string;
  accessGuess?: string;
  floodFlag?: 'yes' | 'no' | 'unknown';
  slopeFlag?: 'steep' | 'moderate' | 'flat' | 'unknown';
  rawData?: any;
}

export interface CompProperty {
  apn?: string;
  address?: string;
  county: string;
  state: string;
  lat: number;
  lon: number;
  acres: number;
  price: number;
  pricePerAcre: number;
  saleDate?: Date;
  listingDate?: Date;
  status: 'sold' | 'active';
  distance?: number; // Distance from subject in miles
  rawData?: any;
}

export interface CompScore {
  comp: CompProperty;
  score: number;
  breakdown: {
    distanceScore: number;
    acreageScore: number;
    recencyScore: number;
    accessPenalty: number;
    floodPenalty: number;
    slopePenalty: number;
  };
}

export interface ValueEstimate {
  low: number;
  mid: number;
  high: number;
  confidence: number; // 0-100
  compCount: number;
  methodology: string;
}

export interface LandReport {
  id: string;
  query: string;
  subject: ParcelData;
  comps: CompScore[];
  estimate: ValueEstimate;
  verificationChecklist: {
    access: boolean;
    easements: boolean;
    utilities: boolean;
    restrictions: boolean;
    wetlands: boolean;
  };
  sources: string[];
  rawData?: any;
  createdAt: Date;
}

export interface CountyAdapter {
  name: string;
  counties: string[];
  states: string[];
  
  // Lookup parcel data by APN or address
  lookupParcel(apn?: string, address?: string, geocode?: GeocodeResult): Promise<ParcelData | null>;
  
  // Find comparable sales/listings
  findComps(subject: ParcelData, limit?: number): Promise<CompProperty[]>;
  
  // Check if this adapter can handle the given county/state
  canHandle(county: string, state: string): boolean;
}
