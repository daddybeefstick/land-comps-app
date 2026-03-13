import { getNcZipcodes } from '@/lib/nc-data';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const zipcodes = await getNcZipcodes();
    return NextResponse.json({
      state: 'North Carolina',
      count: zipcodes.length,
      zipcodes,
    });
  } catch (e) {
    console.error('NC zipcodes API error:', e);
    return NextResponse.json(
      { error: 'Failed to load NC zipcodes' },
      { status: 500 }
    );
  }
}
