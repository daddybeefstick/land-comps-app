import { buildSheetRow } from '@/lib/nc-data';
import { NextRequest, NextResponse } from 'next/server';

type Body = { rows: Array<{ zip: string; county: string }> };

export async function POST(req: NextRequest) {
  try {
    const body: Body = await req.json();
    const rows = body.rows || [];
    const out: string[][] = [];
    out.push(['NC', 'Zip', 'County', 'Green', 'Yellow', 'Red']);
    for (const r of rows) {
      const zip = String(r.zip || '').trim();
      const county = String(r.county || '').trim();
      if (!zip || !county) continue;
      const countyDisplay = county.endsWith(' County') ? county : `${county} County`;
      out.push(buildSheetRow(zip, countyDisplay));
    }
    return NextResponse.json({ rows: out });
  } catch (e) {
    console.error('Sheet export error:', e);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
