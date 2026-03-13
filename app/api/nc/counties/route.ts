import { getNcCounties } from '@/lib/nc-data';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const counties = await getNcCounties();
    return NextResponse.json({
      state: 'North Carolina',
      count: counties.length,
      counties,
    });
  } catch (e) {
    console.error('NC counties API error:', e);
    return NextResponse.json(
      { error: 'Failed to load NC counties' },
      { status: 500 }
    );
  }
}
