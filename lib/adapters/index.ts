import { CountyAdapter } from '@/types';
import { GenericAdapter } from './generic';
import { AdamsCountyOHAdapter } from './adams-oh';

// Registry of all available adapters
const adapters: CountyAdapter[] = [
  new AdamsCountyOHAdapter(),
  new GenericAdapter(), // Generic adapter should be last (fallback)
];

export function getAdapterForCounty(county: string, state: string): CountyAdapter {
  // Find the first adapter that can handle this county/state
  const adapter = adapters.find(a => a.canHandle(county, state));
  return adapter || adapters[adapters.length - 1]; // Fallback to generic
}

export function getAllAdapters(): CountyAdapter[] {
  return adapters;
}

export { GenericAdapter, AdamsCountyOHAdapter };
