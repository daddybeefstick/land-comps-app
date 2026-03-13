import { NextRequest, NextResponse } from 'next/server';
import { generateReport } from '@/lib/report-generator';
import { parseListingText } from '@/lib/listing-parse';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, acres, pricePerAcre, listingText } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required (address or APN)' },
        { status: 400 }
      );
    }

    let finalAcres = acres;
    let finalPricePerAcre = pricePerAcre;

    if (listingText && (finalAcres == null || finalPricePerAcre == null)) {
      const hints = parseListingText(String(listingText), query);
      if (finalAcres == null && hints.acres) {
        finalAcres = hints.acres;
      }
      if (finalPricePerAcre == null && hints.price && (finalAcres ?? 0) > 0) {
        finalPricePerAcre = hints.price / (finalAcres as number);
      }
    }

    const report = await generateReport(query.trim(), finalAcres, finalPricePerAcre);

    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter is required' },
      { status: 400 }
    );
  }

  try {
    const report = await generateReport(query.trim());
    return NextResponse.json(report);
  } catch (error: any) {
    console.error('Error generating report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate report' },
      { status: 500 }
    );
  }
}
