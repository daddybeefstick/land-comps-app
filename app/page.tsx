'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeQuery } from '@/lib/query-normalize';
import { parseListingText } from '@/lib/listing-parse';

export default function Home() {
  const [query, setQuery] = useState('');
  const [acres, setAcres] = useState('');
  const [price, setPrice] = useState('');
  const [listingText, setListingText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const normalizedQuery = normalizeQuery(query);
      if (normalizedQuery !== query) {
        setQuery(normalizedQuery);
      }

      const hints = listingText.trim().length > 0
        ? parseListingText(listingText, normalizedQuery)
        : {};
      const acresValue = acres.trim().length > 0 ? Number(acres.trim()) : hints.acres;
      const priceValue = price.trim().length > 0 ? Number(price.trim()) : hints.price;

      if (!acres && hints.acres) {
        setAcres(String(hints.acres));
      }
      if (!price && hints.price) {
        setPrice(String(hints.price));
      }

      const pricePerAcre =
        Number.isFinite(priceValue) &&
        Number.isFinite(acresValue) &&
        (acresValue as number) > 0
          ? (priceValue as number) / (acresValue as number)
          : undefined;
      const response = await fetch('/api/report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: normalizedQuery.trim(),
          acres: Number.isFinite(acresValue) ? acresValue : undefined,
          pricePerAcre: pricePerAcre && pricePerAcre > 0 ? pricePerAcre : undefined,
          listingText: listingText.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate report');
      }

      const report = await response.json();
      // Store report in sessionStorage for the report page
      sessionStorage.setItem(`report_${report.id}`, JSON.stringify(report));
      router.push(`/report/${report.id}`);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Land Comps Analyzer
          </h1>
          <p className="text-gray-600">
            Enter an address or APN to generate a comprehensive land analysis report
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter address or APN (e.g., '123 Main St, City, State' or '12-34-56')"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <div className="flex flex-col md:flex-row gap-4">
              <input
                type="number"
                min="0"
                step="0.01"
                value={acres}
                onChange={(e) => setAcres(e.target.value)}
                placeholder="Optional: acres (e.g., 3)"
                className="md:w-48 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Optional: total price (e.g., 69000)"
                className="md:w-64 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !query.trim()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {loading ? 'Analyzing...' : 'Analyze'}
              </button>
            </div>
          </div>
          <div className="mt-4">
            <textarea
              value={listingText}
              onChange={(e) => setListingText(e.target.value)}
              placeholder="Optional: paste listing text (Zillow/Redfin) to auto-detect acres and price"
              className="w-full min-h-[100px] px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}

          {loading && (
            <div className="mt-4 flex items-center gap-2 text-gray-600">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span>Generating report...</span>
            </div>
          )}
        </form>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Powered by OpenStreetMap, public data sources, and free APIs</p>
          <p className="mt-2">
            <button
              type="button"
              onClick={() => router.push('/browse')}
              className="text-blue-600 hover:underline"
            >
              Browse NC counties & zipcodes →
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
