import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reportId = params.id;

    // Try to find in cache
    const cachedReports = await prisma.reportCache.findMany({
      where: {
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Check recent reports
    });

    // Search through cached reports for matching ID
    for (const cached of cachedReports) {
      const reportData = JSON.parse(cached.reportData);
      if (reportData.id === reportId) {
        return NextResponse.json({
          ...reportData,
          createdAt: cached.createdAt,
        });
      }
    }

    return NextResponse.json(
      { error: 'Report not found' },
      { status: 404 }
    );
  } catch (error: any) {
    console.error('Error fetching report:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch report' },
      { status: 500 }
    );
  }
}
