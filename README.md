# Land Comps Analyzer

A local web application for automated land comparable sales analysis. Enter an address or APN (parcel number), and get a comprehensive report with parcel details, comparable properties, value estimates, and verification checklists.

## Features

- **Input**: Address or APN (parcel number)
- **Output**: Comprehensive report including:
  - Subject parcel summary (county, state, acres, coordinates, zoning, access, flood, slope)
  - Top 8-12 comparable properties with scoring
  - Value estimate (low/mid/high) with confidence score
  - Verification checklist
  - Interactive map
- **Fully Automated**: Input → Fetch → Score → Render
- **Free**: Uses only public/free data sources
- **Extensible**: County adapter system for adding new data sources

## Tech Stack

- **Frontend**: Next.js 14 + TypeScript + Tailwind CSS
- **Backend**: Next.js API Routes (Node.js)
- **Database**: SQLite with Prisma ORM
- **Mapping**: Leaflet (OpenStreetMap)
- **Geocoding**: Nominatim (OpenStreetMap)

## Installation

### Prerequisites

- Node.js 18+ and npm/yarn
- Git (optional)

### Steps

1. **Clone or navigate to the project directory**:
   ```bash
   cd land-comps-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up the database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Start the development server**:
   ```bash
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000`

## Usage

1. On the home page, enter an address (e.g., "123 Main St, Columbus, OH") or an APN (e.g., "12-34-56")
2. Click "Analyze" or press Enter
3. Wait for the report to generate (this may take a few seconds)
4. Review the comprehensive report with:
   - Parcel details
   - Comparable properties table
   - Value estimates
   - Verification checklist
   - Interactive map

## Adding a New County Adapter

The application uses an adapter pattern to support different counties and data sources. To add a new county adapter:

### Step 1: Create the Adapter File

Create a new file in `lib/adapters/` (e.g., `lib/adapters/your-county.ts`):

```typescript
import { BaseCountyAdapter } from './base';
import { ParcelData, CompProperty, GeocodeResult } from '@/types';

export class YourCountyAdapter extends BaseCountyAdapter {
  name = 'Your County, State';
  counties = ['Your County'];
  states = ['State', 'ST']; // Include both full name and abbreviation

  async lookupParcel(
    apn?: string,
    address?: string,
    geocode?: GeocodeResult
  ): Promise<ParcelData | null> {
    if (!geocode) return null;

    // Implement your parcel lookup logic here
    // This might involve:
    // - Querying county assessor APIs
    // - Scraping public records
    // - Using public GIS data
    
    return {
      apn,
      address: address || geocode.address,
      county: 'Your County',
      state: 'State',
      lat: geocode.lat,
      lon: geocode.lon,
      acres: 10, // From your data source
      zoning: 'Agricultural', // From your data source
      landUse: 'Farmland', // From your data source
      accessGuess: this.guessAccess(address),
      floodFlag: await this.checkFloodZone(geocode.lat, geocode.lon),
      slopeFlag: await this.estimateSlope(geocode.lat, geocode.lon),
    };
  }

  async findComps(subject: ParcelData, limit: number = 12): Promise<CompProperty[]> {
    // Implement your comps search logic here
    // Filter by:
    // - Same county (or within radius)
    // - Similar acreage (e.g., 50% to 200% of subject)
    // - Recent sales (prefer last 18 months)
    // - Distance (e.g., within 20 miles)
    
    const comps: CompProperty[] = [];
    
    // Example structure:
    // const sales = await queryYourDataSource({
    //   county: subject.county,
    //   minAcres: subject.acres ? subject.acres * 0.5 : 0,
    //   maxAcres: subject.acres ? subject.acres * 2 : Infinity,
    //   maxDistance: 20,
    //   centerLat: subject.lat,
    //   centerLon: subject.lon,
    //   minDate: new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000),
    // });
    
    // Transform your data into CompProperty format:
    // sales.forEach(sale => {
    //   comps.push({
    //     apn: sale.apn,
    //     address: sale.address,
    //     county: sale.county,
    //     state: sale.state,
    //     lat: sale.lat,
    //     lon: sale.lon,
    //     acres: sale.acres,
    //     price: sale.price,
    //     pricePerAcre: sale.price / sale.acres,
    //     saleDate: sale.saleDate,
    //     status: 'sold',
    //     rawData: sale, // Store original data for penalties
    //   });
    // });
    
    return comps.slice(0, limit);
  }
}
```

### Step 2: Register the Adapter

Add your adapter to `lib/adapters/index.ts`:

```typescript
import { YourCountyAdapter } from './your-county';

const adapters: CountyAdapter[] = [
  new YourCountyAdapter(),
  new AdamsCountyOHAdapter(),
  new GenericAdapter(), // Keep generic adapter last as fallback
];
```

### Step 3: Test Your Adapter

1. Start the development server
2. Enter an address or APN in your county
3. Verify that your adapter is being used (check the "Data Sources" section in the report)
4. Verify that parcel data and comps are being fetched correctly

## Data Sources

The application uses the following free/public data sources:

- **Geocoding**: [Nominatim (OpenStreetMap)](https://nominatim.openstreetmap.org/)
- **Flood Data**: FEMA Flood Maps (link provided when unavailable)
- **Elevation/Slope**: USGS Elevation Data (link provided when unavailable)
- **County Data**: Implemented via adapters (see above)

## Caching

The application caches:
- Geocoding results (7 days)
- Parcel data (7 days)
- Comparable properties (7 days)
- Full reports (7 days)

Cache is stored in SQLite database and automatically expires.

## Testing

Run unit tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Project Structure

```
land-comps-app/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   │   └── report/        # Report generation endpoint
│   ├── report/            # Report page
│   ├── page.tsx           # Home page
│   └── layout.tsx         # Root layout
├── components/            # React components
│   └── MapComponent.tsx   # Leaflet map component
├── lib/                   # Core logic
│   ├── adapters/         # County adapters
│   │   ├── base.ts       # Base adapter class
│   │   ├── generic.ts    # Generic fallback adapter
│   │   ├── adams-oh.ts   # Example: Adams County, OH
│   │   └── index.ts      # Adapter registry
│   ├── comps-engine.ts   # Scoring and estimation logic
│   ├── geocoding.ts       # Geocoding service
│   ├── report-generator.ts # Report generation
│   └── db.ts             # Prisma client
├── types/                 # TypeScript types
│   └── index.ts          # Core type definitions
├── prisma/               # Prisma schema
│   └── schema.prisma     # Database schema
└── __tests__/            # Unit tests
    └── comps-engine.test.ts
```

## Error Handling

The application handles errors gracefully:

- If geocoding fails, an error message is shown
- If parcel lookup fails, basic data from geocoding is used
- If no comps are found, the report still generates with empty comps table
- Missing data fields are clearly labeled as "Unknown" or "N/A"

## Rate Limiting

The Nominatim geocoding service requires:
- Maximum 1 request per second
- Proper User-Agent header

The application implements:
- Automatic 1-second delay between geocoding requests
- Caching to minimize API calls
- User-Agent header set to "LandCompsApp/1.0"

## Future Enhancements

Potential improvements:

1. **More County Adapters**: Add adapters for more counties/states
2. **FEMA Integration**: Direct API integration for flood zone data
3. **USGS Integration**: Direct integration for elevation/slope data
4. **MLS Integration**: Connect to MLS APIs for active listings
5. **Export**: PDF/Excel export functionality
6. **History**: View previous reports
7. **Batch Processing**: Analyze multiple parcels at once

## License

This project is provided as-is for educational and personal use.

## Support

For issues or questions:
1. Check the README
2. Review the adapter documentation
3. Check error messages in the browser console
4. Review the unit tests for examples
