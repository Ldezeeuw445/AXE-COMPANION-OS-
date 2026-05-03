import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapMarker } from './InteractiveMap';
import { VESSEL_CHOKEPOINTS, type VesselChokepoint } from '../lib/vesselChokepoints';

const TILE_URL =
  'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function popupHtml(m: MapMarker): string {
  const rows = m.details
    ? Object.entries(m.details)
        .map(
          ([k, v]) =>
            `<tr><td style="opacity:.5;font-size:9px;letter-spacing:.08em;text-transform:uppercase;padding:3px 8px 3px 0">${escapeHtml(k)}</td><td style="font-size:11px;color:#e8edf5;padding:3px 0">${escapeHtml(String(v))}</td></tr>`,
        )
        .join('')
    : '';
  return `<div style="min-width:200px;max-width:280px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
    <div style="font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);color:#f8fafc">${escapeHtml(m.label)}</div>
    <table style="width:100%;border-collapse:collapse">${rows}</table>
  </div>`;
}

/** Ring + centre dot — strategic chokepoint (only when live vessel feed). */
function chokepointIconHtml(): string {
  return `<div style="width:24px;height:24px;border-radius:50%;border:2px solid rgba(251,191,36,0.92);background:rgba(8,10,14,0.9);display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px rgba(251,191,36,0.35)" aria-hidden="true">
    <div style="width:6px;height:6px;border-radius:50%;background:#fbbf24;box-shadow:0 0 6px rgba(251,191,36,0.9)"></div>
  </div>`;
}

function chokepointPopupHtml(c: VesselChokepoint): string {
  return `<div style="min-width:200px;max-width:280px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace">
    <div style="font-weight:600;font-size:12px;margin-bottom:6px;color:#fbbf24;letter-spacing:.04em">CHOKEPOINT</div>
    <div style="font-weight:600;font-size:13px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);color:#f8fafc">${escapeHtml(c.name)}</div>
    <div style="font-size:10px;color:rgba(248,250,252,.55);margin-bottom:6px">${escapeHtml(c.region)}</div>
    <div style="font-size:11px;color:#e8edf5;line-height:1.45">${escapeHtml(c.note)}</div>
  </div>`;
}

function markerHtml(m: MapMarker): string {
  const c = m.color;
  const ring = `${c}66`;
  if (m.icon === 'ship') {
    return `<div style="width:30px;height:30px;border-radius:50%;background:rgba(10,12,18,.94);border:2px solid ${c};display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${ring};font-size:15px;line-height:1" aria-hidden="true"><span style="color:${c}">⚓</span></div>`;
  }
  const deg = m.details?.heading ?? '45';
  return `<div style="width:28px;height:28px;border-radius:50%;background:rgba(10,12,18,.94);border:2px solid ${c};display:flex;align-items:center;justify-content:center;box-shadow:0 0 16px ${ring};transform:rotate(${deg}deg)">
    <svg width="13" height="13" viewBox="0 0 24 24" fill="${c}" aria-hidden="true"><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
  </div>`;
}

export interface TrackingMapProps {
  markers: MapMarker[];
  /** Default framing when there are few / no markers */
  mode: 'jets' | 'vessels';
  height?: number;
  className?: string;
  /**
   * When `mode === 'vessels'` and this is true, strategic chokepoints (Hormuz, Suez, …)
   * render as ring+dot markers. Wire to your live AIS / stream `connected` state.
   */
  vesselFeedLive?: boolean;
}

/**
 * Real slippy map (Leaflet + Carto Dark) for Intel jet / vessel cards only.
 * Pan, scroll zoom, + brand-colored div markers.
 */
export default function TrackingMap({
  markers,
  mode,
  height = 300,
  className = '',
  vesselFeedLive = false,
}: TrackingMapProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;

    const defaultCenter: L.LatLngExpression =
      mode === 'jets' ? [39.2, -98.2] : [26.2, 56.4];
    const defaultZoom = mode === 'jets' ? 4 : 6;

    const map = L.map(el, {
      center: defaultCenter,
      zoom: defaultZoom,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      minZoom: 2,
      maxZoom: 18,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIB,
      subdomains: 'abcd',
      maxZoom: 20,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    groupRef.current = group;

    const ro = new ResizeObserver(() => {
      map.invalidateSize();
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;

    group.clearLayers();

    const showChoke = mode === 'vessels' && vesselFeedLive;

    if (showChoke) {
      for (const c of VESSEL_CHOKEPOINTS) {
        const cpIcon = L.divIcon({
          className: 'tos-leaflet-divicon tos-leaflet-chokepoint',
          html: chokepointIconHtml(),
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });
        const marker = L.marker([c.lat, c.lon], {
          icon: cpIcon,
          zIndexOffset: -400,
        }).addTo(group);
        marker.bindPopup(chokepointPopupHtml(c), {
          maxWidth: 320,
          className: 'tos-leaflet-popup-wrap',
          closeButton: true,
        });
      }
    }

    for (const m of markers) {
      const icon = L.divIcon({
        className: 'tos-leaflet-divicon',
        html: markerHtml(m),
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const marker = L.marker([m.lat, m.lon], {
        icon,
        zIndexOffset: 200,
      }).addTo(group);
      marker.bindPopup(popupHtml(m), {
        maxWidth: 320,
        className: 'tos-leaflet-popup-wrap',
        closeButton: true,
      });
    }

    const boundPoints: L.LatLngTuple[] = markers.map(
      (x) => [x.lat, x.lon] as L.LatLngTuple,
    );
    if (showChoke) {
      for (const c of VESSEL_CHOKEPOINTS) {
        boundPoints.push([c.lat, c.lon]);
      }
    }

    if (boundPoints.length >= 2) {
      const bounds = L.latLngBounds(boundPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds.pad(0.14), { maxZoom: mode === 'jets' ? 6 : 7 });
      }
    } else if (boundPoints.length === 1) {
      map.setView(boundPoints[0], mode === 'jets' ? 6 : 8);
    } else {
      const defaultCenter: L.LatLngExpression =
        mode === 'jets' ? [39.2, -98.2] : [26.2, 56.4];
      map.setView(defaultCenter, mode === 'jets' ? 4 : 6);
    }
  }, [markers, mode, vesselFeedLive]);

  return (
    <div
      ref={hostRef}
      className={`tos-tracking-map relative z-0 w-full overflow-hidden rounded-lg border border-white/[0.08] bg-[#060a10] ${className}`}
      style={{ height }}
    />
  );
}
