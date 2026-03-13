/**
 * NC counties and zipcodes data with consistent color assignment per (county, zipcode).
 * Color is deterministic so the same zipcode in the same county always gets the same color.
 */

// Green, red, yellow only (like map pin tiers)
const ZIPCODE_COLOR_PALETTE = [
  '#22c55e', // green
  '#ef4444', // red
  '#eab308', // yellow
] as const;

export type NcCounty = { name: string; fips: string };

export type NcZipcode = {
  zip: string;
  county: string;
  lat: number;
  lon: number;
  color: string;
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = (h << 5) - h + c;
    h |= 0;
  }
  return Math.abs(h);
}

/** Assign a consistent color to a (county, zipcode) pair. */
export function getColorForZipInCounty(county: string, zip: string): string {
  const key = `${county.toLowerCase().trim()}|${zip.trim()}`;
  const index = hashString(key) % ZIPCODE_COLOR_PALETTE.length;
  return ZIPCODE_COLOR_PALETTE[index];
}

/** Map hex color to sheet column name (Green, Yellow, Red). */
export function colorHexToName(hex: string): 'Green' | 'Yellow' | 'Red' {
  const h = hex.toLowerCase();
  if (h === '#22c55e') return 'Green';
  if (h === '#eab308') return 'Yellow';
  if (h === '#ef4444') return 'Red';
  return 'Green'; // fallback
}

/** Build one sheet row: [NC, zip, countyDisplay, greenCol, yellowCol, redCol]. */
export function buildSheetRow(zip: string, countyDisplay: string): [string, string, string, string, string, string] {
  const countyNorm = countyDisplay.replace(/\s+County$/i, '').trim();
  const hex = getColorForZipInCounty(countyNorm, zip);
  const name = colorHexToName(hex);
  return [
    'NC',
    zip.trim(),
    countyDisplay.trim(),
    name === 'Green' ? 'Green' : '',
    name === 'Yellow' ? 'Yellow' : '',
    name === 'Red' ? 'Red' : '',
  ];
}

let countiesCache: NcCounty[] | null = null;
let zipcodesCache: NcZipcode[] | null = null;

export async function getNcCounties(): Promise<NcCounty[]> {
  if (countiesCache) return countiesCache;
  const data = await import('@/data/nc-counties.json');
  countiesCache = data.default as NcCounty[];
  return countiesCache;
}

export async function getNcZipcodes(): Promise<NcZipcode[]> {
  if (zipcodesCache) return zipcodesCache;
  const data = await import('@/data/nc-zipcodes.json');
  const rows = data.default as Array<{ zip: string; county: string; lat: number; lon: number }>;
  zipcodesCache = rows.map((row) => ({
    ...row,
    color: getColorForZipInCounty(row.county, row.zip),
  }));
  return zipcodesCache;
}

/** Get zipcodes grouped by county. */
export async function getNcZipcodesByCounty(): Promise<Map<string, NcZipcode[]>> {
  const zipcodes = await getNcZipcodes();
  const byCounty = new Map<string, NcZipcode[]>();
  for (const z of zipcodes) {
    const list = byCounty.get(z.county) ?? [];
    list.push(z);
    byCounty.set(z.county, list);
  }
  return byCounty;
}
