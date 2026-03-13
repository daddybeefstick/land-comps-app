import { CompProperty, CompScore, ParcelData, ValueEstimate } from '@/types';
import { calculateDistance } from './geocoding';
import { differenceInMonths } from 'date-fns';

export function scoreComps(
  subject: ParcelData,
  comps: CompProperty[]
): CompScore[] {
  const scored: CompScore[] = comps.map(comp => {
    const distance = comp.distance || calculateDistance(
      subject.lat,
      subject.lon,
      comp.lat,
      comp.lon
    );

    // Distance score (closer is better, max 30 points)
    // 0 miles = 30 points, 10 miles = 15 points, 20+ miles = 5 points
    const distanceScore = Math.max(5, 30 - distance * 1.5);

    // Acreage similarity score (max 25 points)
    // Perfect match = 25, 50% difference = 12.5, 100%+ difference = 5
    const acreageDiff = subject.acres && comp.acres
      ? Math.abs(subject.acres - comp.acres) / Math.max(subject.acres, comp.acres)
      : 1;
    const acreageScore = Math.max(5, 25 * (1 - acreageDiff));

    // Recency score (max 25 points)
    // Last 6 months = 25, 6-12 months = 20, 12-18 months = 15, 18-24 months = 10, 24+ months = 5
    let recencyScore = 5;
    if (comp.status === 'sold' && comp.saleDate) {
      const monthsAgo = differenceInMonths(new Date(), comp.saleDate);
      if (monthsAgo <= 6) recencyScore = 25;
      else if (monthsAgo <= 12) recencyScore = 20;
      else if (monthsAgo <= 18) recencyScore = 15;
      else if (monthsAgo <= 24) recencyScore = 10;
    } else if (comp.status === 'active' && comp.listingDate) {
      // Active listings get recency based on listing date
      const monthsAgo = differenceInMonths(new Date(), comp.listingDate);
      if (monthsAgo <= 3) recencyScore = 20; // Active listings slightly less weight
      else if (monthsAgo <= 6) recencyScore = 15;
      else recencyScore = 10;
    } else if (comp.status === 'active') {
      recencyScore = 15; // Active but no date, assume recent
    }

    // Penalties for mismatches (max -20 points total)
    let accessPenalty = 0;
    if (subject.accessGuess && comp.rawData?.access) {
      if (subject.accessGuess !== comp.rawData.access) {
        accessPenalty = -5;
      }
    }

    let floodPenalty = 0;
    if (subject.floodFlag && comp.rawData?.floodFlag) {
      if (subject.floodFlag !== comp.rawData.floodFlag) {
        floodPenalty = -5;
      }
    }

    let slopePenalty = 0;
    if (subject.slopeFlag && comp.rawData?.slopeFlag) {
      if (subject.slopeFlag !== comp.rawData.slopeFlag) {
        slopePenalty = -5;
      }
    }

    const totalScore = distanceScore + acreageScore + recencyScore + accessPenalty + floodPenalty + slopePenalty;

    return {
      comp: {
        ...comp,
        distance,
      },
      score: Math.max(0, totalScore),
      breakdown: {
        distanceScore,
        acreageScore,
        recencyScore,
        accessPenalty,
        floodPenalty,
        slopePenalty,
      },
    };
  });

  // Sort by score descending
  return scored.sort((a, b) => b.score - a.score);
}

export function estimateValue(
  scoredComps: CompScore[],
  subjectAcres?: number
): ValueEstimate {
  if (scoredComps.length === 0) {
    return {
      low: 0,
      mid: 0,
      high: 0,
      confidence: 0,
      compCount: 0,
      methodology: 'No comparable properties found',
    };
  }

  // Filter to top comps (score > 20) and limit to 12
  const topComps = scoredComps
    .filter(c => c.score > 20)
    .slice(0, 12);

  if (topComps.length === 0) {
    return {
      low: 0,
      mid: 0,
      high: 0,
      confidence: 10,
      compCount: scoredComps.length,
      methodology: 'No high-quality comparable properties found',
    };
  }

  // Calculate price per acre for each comp
  const pricesPerAcre = topComps.map(c => c.comp.pricePerAcre).sort((a, b) => a - b);

  // Weighted median (using scores as weights)
  const totalScore = topComps.reduce((sum, c) => sum + c.score, 0);
  let cumulativeScore = 0;
  let median = pricesPerAcre[0];
  const medianTarget = totalScore / 2;

  for (let i = 0; i < topComps.length; i++) {
    cumulativeScore += topComps[i].score;
    if (cumulativeScore >= medianTarget) {
      median = pricesPerAcre[i];
      break;
    }
  }

  // Calculate quartiles
  const q1Index = Math.floor(pricesPerAcre.length * 0.25);
  const q3Index = Math.floor(pricesPerAcre.length * 0.75);
  const low = pricesPerAcre[q1Index] || pricesPerAcre[0];
  const high = pricesPerAcre[q3Index] || pricesPerAcre[pricesPerAcre.length - 1];

  // Calculate total value if subject has acres
  const lowTotal = subjectAcres ? low * subjectAcres : low;
  const midTotal = subjectAcres ? median * subjectAcres : median;
  const highTotal = subjectAcres ? high * subjectAcres : high;

  // Confidence calculation
  // Base: number of comps (max 50 points for 8+ comps)
  // Quality: average score (max 30 points for avg score > 60)
  // Recency: percentage of recent comps (max 20 points)
  const avgScore = topComps.reduce((sum, c) => sum + c.score, 0) / topComps.length;
  const recentComps = topComps.filter(c => {
    if (c.comp.status === 'sold' && c.comp.saleDate) {
      return differenceInMonths(new Date(), c.comp.saleDate) <= 18;
    }
    return c.comp.status === 'active';
  }).length;
  const recencyRatio = recentComps / topComps.length;

  const compCountScore = Math.min(50, (topComps.length / 12) * 50);
  const qualityScore = Math.min(30, (avgScore / 100) * 30);
  const recencyScore = recencyRatio * 20;

  const confidence = Math.round(compCountScore + qualityScore + recencyScore);

  return {
    low: Math.round(lowTotal),
    mid: Math.round(midTotal),
    high: Math.round(highTotal),
    confidence: Math.min(100, confidence),
    compCount: topComps.length,
    methodology: `Weighted median of ${topComps.length} comparable properties (${recentComps} recent)`,
  };
}
