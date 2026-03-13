'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { NcCounty, NcZipcode } from '@/lib/nc-data';

const MapComponent = dynamic(() => import('@/components/MapComponent'), { ssr: false });

const NC_CENTER: [number, number] = [35.5, -79.0];
const NC_ZOOM = 7;

type CountiesResponse = { state: string; count: number; counties: NcCounty[] };
type ZipcodesResponse = { state: string; count: number; zipcodes: NcZipcode[] };

function parsePastedList(text: string): Array<{ zip: string; county: string }> {
  const rows: Array<{ zip: string; county: string }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const parts = line.split(/\t/).map((p) => p.trim());
    if (parts.length < 3) continue;
    const zip = parts[1];
    const county = parts[2];
    if (!zip || !county) continue;
    if (parts[3] === 'Green' && parts[4] === 'Yellow' && parts[5] === 'Red') continue;
    if (/^\d{5}$/.test(zip)) rows.push({ zip, county });
  }
  return rows;
}

export default function BrowseNcPage() {
  const router = useRouter();
  const [counties, setCounties] = useState<NcCounty[]>([]);
  const [zipcodes, setZipcodes] = useState<NcZipcode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countySearch, setCountySearch] = useState('');
  const [selectedCounty, setSelectedCounty] = useState<string | null>(null);
  const [pastedList, setPastedList] = useState('');
  const [sheetRows, setSheetRows] = useState<string[][] | null>(null);
  const [exportStatus, setExportStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  useEffect(() => {
    async function load() {
      try {
        const [countiesRes, zipcodesRes] = await Promise.all([
          fetch('/api/nc/counties'),
          fetch('/api/nc/zipcodes'),
        ]);
        if (!countiesRes.ok) throw new Error('Failed to load counties');
        if (!zipcodesRes.ok) throw new Error('Failed to load zipcodes');
        const countiesData: CountiesResponse = await countiesRes.json();
        const zipcodesData: ZipcodesResponse = await zipcodesRes.json();
        setCounties(countiesData.counties);
        setZipcodes(zipcodesData.zipcodes);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load NC data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredCounties = useMemo(() => {
    const q = countySearch.toLowerCase().trim();
    if (!q) return counties;
    return counties.filter((c) => c.name.toLowerCase().includes(q));
  }, [counties, countySearch]);

  const zipcodesByCounty = useMemo(() => {
    const map = new Map<string, NcZipcode[]>();
    for (const z of zipcodes) {
      const list = map.get(z.county) ?? [];
      list.push(z);
      map.set(z.county, list);
    }
    return map;
  }, [zipcodes]);

  const mapMarkers = useMemo(
    () =>
      zipcodes.map((z) => ({
        lat: z.lat,
        lon: z.lon,
        label: `${z.zip} – ${z.county} County`,
        color: z.color,
      })),
    [zipcodes]
  );

  async function generateSheet() {
    const rows = parsePastedList(pastedList);
    if (rows.length === 0) {
      setExportStatus('error');
      return;
    }
    setExportStatus('loading');
    try {
      const res = await fetch('/api/nc/sheet-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error('Export failed');
      const data = await res.json();
      setSheetRows(data.rows || []);
      setExportStatus('done');
    } catch {
      setExportStatus('error');
    }
  }

  function downloadCsv() {
    if (!sheetRows || sheetRows.length === 0) return;
    const csv = sheetRows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'nc-zipcodes-sheet.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function copyForSheets() {
    if (!sheetRows || sheetRows.length === 0) return;
    const tsv = sheetRows.map((r) => r.join('\t')).join('\n');
    await navigator.clipboard.writeText(tsv);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading NC counties and zipcodes...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-md w-full">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p className="text-gray-700 mb-4">{error}</p>
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-full px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">NC Counties & Zipcodes</h1>
          <button
            onClick={() => router.push('/')}
            className="px-3 py-1.5 text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
          >
            Home
          </button>
        </div>
      </header>

      {/* Paste list → Google Sheet format (NC, Zip, County, Green, Yellow, Red) */}
      <div className="bg-white border-b border-gray-200 p-4">
        <h2 className="text-sm font-semibold text-gray-900 mb-2">Export for Google Sheets</h2>
        <p className="text-xs text-gray-600 mb-2">
          Paste your list (tab-separated: NC, zip, county). We assign Green/Yellow/Red per zip. Then download CSV or copy and paste into a sheet.
        </p>
        <textarea
          placeholder={'NC\t27201\tAlamance County\nNC\t27202\tAlamance County\n...'}
          value={pastedList}
          onChange={(e) => { setPastedList(e.target.value); setSheetRows(null); setExportStatus('idle'); }}
          className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          <button
            type="button"
            onClick={generateSheet}
            disabled={!pastedList.trim() || exportStatus === 'loading'}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {exportStatus === 'loading' ? 'Generating…' : 'Generate for Google Sheets'}
          </button>
          {exportStatus === 'done' && sheetRows && (
            <>
              <button type="button" onClick={downloadCsv} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700">
                Download CSV
              </button>
              <button type="button" onClick={copyForSheets} className="px-3 py-1.5 bg-gray-600 text-white rounded-lg text-sm hover:bg-gray-700">
                Copy (paste into Sheets)
              </button>
            </>
          )}
          {exportStatus === 'error' && <span className="text-red-600 text-sm">Paste at least one row (NC, zip, county).</span>}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Map */}
        <div className="lg:w-1/2 h-80 lg:h-full min-h-[300px]">
          <MapComponent
            center={NC_CENTER}
            zoom={NC_ZOOM}
            markers={mapMarkers}
          />
        </div>

        {/* Counties + Zipcodes list */}
        <div className="lg:w-1/2 flex flex-col bg-white border-l border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Counties <span className="text-gray-500 font-normal">{counties.length} North Carolina</span>
            </h2>
            <input
              type="text"
              placeholder="Search counties..."
              value={countySearch}
              onChange={(e) => setCountySearch(e.target.value)}
              className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-4">
              {filteredCounties.map((county) => {
                const zips = zipcodesByCounty.get(county.name) ?? [];
                const isSelected = selectedCounty === county.name;
                return (
                  <li key={county.name} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSelectedCounty(isSelected ? null : county.name)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 text-left"
                    >
                      <span className="font-medium text-gray-900">{county.name} County</span>
                      <span className="text-gray-500 text-sm">{zips.length} zip{zips.length !== 1 ? 's' : ''}</span>
                    </button>
                    {(isSelected || zips.length <= 3) && (
                      <div className="px-4 py-2 bg-white border-t border-gray-100">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                          Zipcode – color (within this county)
                        </p>
                        <ul className="space-y-1.5">
                          {zips.map((z) => (
                            <li key={`${z.county}-${z.zip}`} className="flex items-center gap-2 text-sm">
                              <span
                                className="shrink-0 w-4 h-4 rounded-full border border-gray-300"
                                style={{ backgroundColor: z.color }}
                                title={z.color}
                              />
                              <span className="font-mono text-gray-800">{z.zip}</span>
                              <span className="text-gray-500">→ {z.color}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {filteredCounties.length === 0 && (
              <p className="text-gray-500 text-sm">No counties match your search.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
