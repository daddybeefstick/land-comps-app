'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { LandReport } from '@/types';
import dynamic from 'next/dynamic';

// Dynamically import map component to avoid SSR issues
const MapComponent = dynamic(() => import('@/components/MapComponent'), {
  ssr: false,
});

export default function ReportPage() {
  const params = useParams();
  const router = useRouter();
  const [report, setReport] = useState<LandReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawData, setShowRawData] = useState(false);

  useEffect(() => {
    async function fetchReport() {
      try {
        // First try sessionStorage (for immediate navigation)
        const storedReport = sessionStorage.getItem(`report_${params.id}`);
        if (storedReport) {
          setReport(JSON.parse(storedReport));
          setLoading(false);
          return;
        }

        // Fallback to API
        const response = await fetch(`/api/report/${params.id}`);
        if (!response.ok) {
          throw new Error('Report not found');
        }
        const reportData = await response.json();
        setReport(reportData);
        // Cache in sessionStorage for future use
        sessionStorage.setItem(`report_${params.id}`, JSON.stringify(reportData));
        setLoading(false);
      } catch (err: any) {
        setError(err.message || 'Failed to load report');
        setLoading(false);
      }
    }

    fetchReport();
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700 mb-4">{error || 'Report not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Land Analysis Report</h1>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              New Analysis
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Subject Parcel Summary */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Subject Parcel</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Address/APN</label>
              <p className="text-gray-900 font-medium">{report.subject.address || report.subject.apn || 'N/A'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">County</label>
              <p className="text-gray-900">{report.subject.county}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">State</label>
              <p className="text-gray-900">{report.subject.state}</p>
            </div>
            {report.subject.acres && (
              <div>
                <label className="text-sm font-medium text-gray-500">Acres</label>
                <p className="text-gray-900">{report.subject.acres.toFixed(2)}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-500">Coordinates</label>
              <p className="text-gray-900 text-sm">{report.subject.lat.toFixed(6)}, {report.subject.lon.toFixed(6)}</p>
            </div>
            {report.subject.zoning && (
              <div>
                <label className="text-sm font-medium text-gray-500">Zoning</label>
                <p className="text-gray-900">{report.subject.zoning}</p>
              </div>
            )}
            {report.subject.landUse && (
              <div>
                <label className="text-sm font-medium text-gray-500">Land Use</label>
                <p className="text-gray-900">{report.subject.landUse}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-500">Access</label>
              <p className="text-gray-900">{report.subject.accessGuess || 'Unknown'}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Flood Zone</label>
              <span className={`inline-block px-2 py-1 rounded text-sm ${
                report.subject.floodFlag === 'yes' ? 'bg-red-100 text-red-800' :
                report.subject.floodFlag === 'no' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {report.subject.floodFlag === 'yes' ? 'Yes' :
                 report.subject.floodFlag === 'no' ? 'No' : 'Unknown'}
              </span>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Slope</label>
              <span className={`inline-block px-2 py-1 rounded text-sm ${
                report.subject.slopeFlag === 'steep' ? 'bg-orange-100 text-orange-800' :
                report.subject.slopeFlag === 'moderate' ? 'bg-yellow-100 text-yellow-800' :
                report.subject.slopeFlag === 'flat' ? 'bg-green-100 text-green-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {report.subject.slopeFlag || 'Unknown'}
              </span>
            </div>
          </div>

          {/* Map */}
          <div className="mt-6 h-64 rounded-lg overflow-hidden border border-gray-200">
            <MapComponent
              center={[report.subject.lat, report.subject.lon]}
              zoom={13}
              markers={[{ lat: report.subject.lat, lon: report.subject.lon, label: 'Subject' }]}
            />
          </div>
        </div>

        {/* Value Estimate */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Value Estimate</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <label className="text-sm font-medium text-red-700">Low Estimate</label>
              <p className="text-2xl font-bold text-red-900">{formatCurrency(report.estimate.low)}</p>
              {report.subject.acres && (
                <p className="text-sm text-red-600 mt-1">
                  {formatCurrency(report.estimate.low / report.subject.acres)}/acre
                </p>
              )}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <label className="text-sm font-medium text-blue-700">Mid Estimate</label>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(report.estimate.mid)}</p>
              {report.subject.acres && (
                <p className="text-sm text-blue-600 mt-1">
                  {formatCurrency(report.estimate.mid / report.subject.acres)}/acre
                </p>
              )}
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <label className="text-sm font-medium text-green-700">High Estimate</label>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(report.estimate.high)}</p>
              {report.subject.acres && (
                <p className="text-sm text-green-600 mt-1">
                  {formatCurrency(report.estimate.high / report.subject.acres)}/acre
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Confidence Score</label>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-xs">
                  <div
                    className={`h-2 rounded-full ${
                      report.estimate.confidence >= 70 ? 'bg-green-600' :
                      report.estimate.confidence >= 40 ? 'bg-yellow-600' :
                      'bg-red-600'
                    }`}
                    style={{ width: `${report.estimate.confidence}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-700">{report.estimate.confidence}%</span>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Comps Used</label>
              <p className="text-gray-900 font-medium">{report.estimate.compCount}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 mt-2">{report.estimate.methodology}</p>
        </div>

        {/* Comps Table */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Comparable Properties ({report.comps.length})
          </h2>
          {report.comps.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p>No comparable properties found.</p>
              <p className="text-sm mt-2">This may be due to limited data availability for this area.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address/APN</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Distance</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acres</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">$/Acre</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sale Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.comps.map((compScore, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {compScore.comp.address || compScore.comp.apn || 'N/A'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {compScore.comp.distance ? `${compScore.comp.distance.toFixed(1)} mi` : 'N/A'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {compScore.comp.acres.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(compScore.comp.price)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(compScore.comp.pricePerAcre)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(compScore.comp.saleDate || compScore.comp.listingDate)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          compScore.comp.status === 'sold' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {compScore.comp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {compScore.score.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Verification Checklist */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Verification Checklist</h2>
          <p className="text-sm text-gray-600 mb-4">
            These items should be verified manually before making any decisions:
          </p>
          <div className="space-y-2">
            {Object.entries(report.verificationChecklist).map(([key, checked]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Data Sources</h2>
          <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
            {report.sources.map((source, idx) => (
              <li key={idx}>{source}</li>
            ))}
          </ul>
        </div>

        {/* Raw Data (Collapsible) */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <button
            onClick={() => setShowRawData(!showRawData)}
            className="flex items-center justify-between w-full text-left"
          >
            <h2 className="text-xl font-bold text-gray-900">Raw Data</h2>
            <span className="text-gray-500">{showRawData ? '▼' : '▶'}</span>
          </button>
          {showRawData && (
            <pre className="mt-4 p-4 bg-gray-50 rounded-lg overflow-auto text-xs text-gray-700">
              {JSON.stringify(report.rawData, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
