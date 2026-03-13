'use client';

import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icon issue in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  });
}

interface Marker {
  lat: number;
  lon: number;
  label?: string;
  /** Optional hex color for pin (e.g. #22c55e). Uses default blue when omitted. */
  color?: string;
}

interface MapComponentProps {
  center: [number, number];
  zoom?: number;
  markers?: Marker[];
}

function createColoredIcon(hexColor: string) {
  return L.divIcon({
    className: 'nc-pin',
    html: `<span style="background-color:${hexColor};width:14px;height:14px;border-radius:50%;display:block;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function MapComponent({ center, zoom = 13, markers = [] }: MapComponentProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize map if it doesn't exist
    if (!mapRef.current) {
      const map = L.map(containerRef.current).setView(center, zoom);

      // Add OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
    } else {
      // Update center if map exists
      mapRef.current.setView(center, zoom);
    }

    // Clear existing markers
    markersRef.current.forEach(marker => {
      if (mapRef.current) {
        mapRef.current.removeLayer(marker);
      }
    });
    markersRef.current = [];

    // Add new markers
    if (mapRef.current) {
      markers.forEach((marker) => {
        const opts: L.MarkerOptions = marker.color
          ? { icon: createColoredIcon(marker.color) }
          : {};
        const leafletMarker = L.marker([marker.lat, marker.lon], opts)
          .addTo(mapRef.current!)
          .bindPopup(marker.label || 'Location');
        markersRef.current.push(leafletMarker);
      });
    }

    return () => {
      // Cleanup is handled by Next.js
    };
  }, [center, zoom, markers]);

  return <div ref={containerRef} className="w-full h-full" />;
}
