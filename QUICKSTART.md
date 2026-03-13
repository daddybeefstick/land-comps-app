# Quick Start Guide

Get the Land Comps Analyzer running in 5 minutes!

## Prerequisites

- Node.js 18 or higher installed
- npm or yarn package manager

## Installation Steps

1. **Navigate to project directory**:
   ```bash
   cd land-comps-app
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Start the app**:
   ```bash
   npm run dev
   ```

5. **Open browser**:
   Go to `http://localhost:3000`

## First Use

1. Enter any address in the search box, for example:
   - `123 Main Street, Columbus, OH`
   - `1600 Pennsylvania Avenue NW, Washington, DC`
   - Any valid address

2. Click "Analyze" or press Enter

3. Wait a few seconds for the report to generate

4. Review the report with:
   - Parcel details
   - Comparable properties (mock data for demonstration)
   - Value estimates
   - Interactive map

## Note on Mock Data

The generic adapter includes mock comparable properties for demonstration purposes. To get real data, you'll need to:

1. Implement a county-specific adapter (see README.md)
2. Connect to actual data sources (county assessor APIs, MLS, etc.)

## Troubleshooting

**Database errors**: Make sure you ran `npx prisma generate` and `npx prisma migrate dev`

**Port already in use**: Change the port with `npm run dev -- -p 3001`

**Geocoding slow**: This is normal - Nominatim requires 1 second between requests. Results are cached.

## Next Steps

- Read the full README.md for detailed documentation
- Check `lib/adapters/` to see example adapters
- Add your own county adapter following the pattern in `adams-oh.ts`
