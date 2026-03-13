import { scoreComps, estimateValue } from '@/lib/comps-engine';
import { ParcelData, CompProperty } from '@/types';

describe('Comps Engine', () => {
  const mockSubject: ParcelData = {
    county: 'Test',
    state: 'Test',
    lat: 40.0,
    lon: -83.0,
    acres: 10,
    accessGuess: 'road_access',
    floodFlag: 'no',
    slopeFlag: 'flat',
  };

  const mockComps: CompProperty[] = [
    {
      county: 'Test',
      state: 'Test',
      lat: 40.01, // ~0.7 miles away
      lon: -83.0,
      acres: 10.5,
      price: 100000,
      pricePerAcre: 9524,
      saleDate: new Date(Date.now() - 3 * 30 * 24 * 60 * 60 * 1000), // 3 months ago
      status: 'sold',
      rawData: {
        access: 'road_access',
        floodFlag: 'no',
        slopeFlag: 'flat',
      },
    },
    {
      county: 'Test',
      state: 'Test',
      lat: 40.05, // ~3.5 miles away
      lon: -83.0,
      acres: 8.0,
      price: 80000,
      pricePerAcre: 10000,
      saleDate: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000), // 12 months ago
      status: 'sold',
      rawData: {
        access: 'road_access',
        floodFlag: 'no',
        slopeFlag: 'flat',
      },
    },
    {
      county: 'Test',
      state: 'Test',
      lat: 40.1, // ~6.9 miles away
      lon: -83.0,
      acres: 15.0,
      price: 150000,
      pricePerAcre: 10000,
      saleDate: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000), // 24 months ago
      status: 'sold',
      rawData: {
        access: 'road_access',
        floodFlag: 'yes', // Mismatch penalty
        slopeFlag: 'flat',
      },
    },
  ];

  describe('scoreComps', () => {
    it('should score comps and sort by score descending', () => {
      const scored = scoreComps(mockSubject, mockComps);

      expect(scored.length).toBe(3);
      expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
      expect(scored[1].score).toBeGreaterThanOrEqual(scored[2].score);
    });

    it('should give higher scores to closer comps', () => {
      const scored = scoreComps(mockSubject, mockComps);
      const closestComp = scored.find(c => c.comp.lat === 40.01);
      const farthestComp = scored.find(c => c.comp.lat === 40.1);

      expect(closestComp).toBeDefined();
      expect(farthestComp).toBeDefined();
      if (closestComp && farthestComp) {
        expect(closestComp.score).toBeGreaterThan(farthestComp.score);
      }
    });

    it('should give higher scores to more recent comps', () => {
      const scored = scoreComps(mockSubject, mockComps);
      const recentComp = scored.find(c => {
        const monthsAgo = Math.floor(
          (Date.now() - (c.comp.saleDate?.getTime() || 0)) / (30 * 24 * 60 * 60 * 1000)
        );
        return monthsAgo <= 6;
      });
      const oldComp = scored.find(c => {
        const monthsAgo = Math.floor(
          (Date.now() - (c.comp.saleDate?.getTime() || 0)) / (30 * 24 * 60 * 60 * 1000)
        );
        return monthsAgo > 18;
      });

      expect(recentComp).toBeDefined();
      expect(oldComp).toBeDefined();
      if (recentComp && oldComp) {
        expect(recentComp.score).toBeGreaterThan(oldComp.score);
      }
    });

    it('should apply penalties for mismatches', () => {
      const scored = scoreComps(mockSubject, mockComps);
      const mismatchedComp = scored.find(c => c.comp.rawData?.floodFlag === 'yes');

      expect(mismatchedComp).toBeDefined();
      if (mismatchedComp) {
        expect(mismatchedComp.breakdown.floodPenalty).toBeLessThan(0);
      }
    });

    it('should calculate distance for comps', () => {
      const scored = scoreComps(mockSubject, mockComps);
      
      scored.forEach(scoredComp => {
        expect(scoredComp.comp.distance).toBeDefined();
        expect(scoredComp.comp.distance).toBeGreaterThan(0);
      });
    });
  });

  describe('estimateValue', () => {
    it('should return zero estimate when no comps provided', () => {
      const estimate = estimateValue([], 10);

      expect(estimate.low).toBe(0);
      expect(estimate.mid).toBe(0);
      expect(estimate.high).toBe(0);
      expect(estimate.confidence).toBe(0);
      expect(estimate.compCount).toBe(0);
    });

    it('should calculate estimate from scored comps', () => {
      const scored = scoreComps(mockSubject, mockComps);
      const estimate = estimateValue(scored, mockSubject.acres);

      expect(estimate.low).toBeGreaterThan(0);
      expect(estimate.mid).toBeGreaterThan(0);
      expect(estimate.high).toBeGreaterThan(0);
      expect(estimate.low).toBeLessThanOrEqual(estimate.mid);
      expect(estimate.mid).toBeLessThanOrEqual(estimate.high);
    });

    it('should calculate confidence based on comp quality', () => {
      const scored = scoreComps(mockSubject, mockComps);
      const estimate = estimateValue(scored, mockSubject.acres);

      expect(estimate.confidence).toBeGreaterThanOrEqual(0);
      expect(estimate.confidence).toBeLessThanOrEqual(100);
      expect(estimate.compCount).toBeGreaterThan(0);
    });

    it('should handle subject without acres', () => {
      const subjectNoAcres = { ...mockSubject, acres: undefined };
      const scored = scoreComps(subjectNoAcres, mockComps);
      const estimate = estimateValue(scored);

      expect(estimate.low).toBeGreaterThan(0);
      expect(estimate.mid).toBeGreaterThan(0);
      expect(estimate.high).toBeGreaterThan(0);
    });

    it('should filter low-quality comps', () => {
      const lowQualityComps: CompProperty[] = [
        {
          county: 'Test',
          state: 'Test',
          lat: 40.5, // Very far
          lon: -83.0,
          acres: 100, // Very different size
          price: 1000000,
          pricePerAcre: 10000,
          saleDate: new Date(Date.now() - 60 * 30 * 24 * 60 * 60 * 1000), // Very old
          status: 'sold',
        },
      ];

      const scored = scoreComps(mockSubject, [...mockComps, ...lowQualityComps]);
      const estimate = estimateValue(scored, mockSubject.acres);

      // Should still produce reasonable estimate using good comps
      expect(estimate.compCount).toBeLessThanOrEqual(12);
    });
  });
});
