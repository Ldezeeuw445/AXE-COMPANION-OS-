// ================================================================
// LeafletWorldMap — slippy dark map for AI Data Center Map.
// Replaces SVG world map rendering while keeping the same props:
// projects, selectedId, onSelect, region.
// ================================================================

import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CATEGORY_COLOR, categoryLabel, fmtMw, fmtUsd, statusLabel } from '../utils/format.js';
import { cx } from '../utils/format.js';
import s from '../styles/map.module.css';

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIB =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

const REGION_VIEWS = {
  world: { center: [20, 0], zoom: 2 },
  n_america: { center: [39.5, -98.5], zoom: 3 },
  europe: { center: [52.2, 10.5], zoom: 4 },
  asia: { center: [28.5, 95.0], zoom: 3 },
  middle_east: { center: [26.5, 56.5], zoom: 4 },
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function projectPopupHtml(p) {
  return `<div style="min-width:220px;max-width:320px">
    <div style="font-weight:600;font-size:12px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);color:#f8fafc">
      ${escapeHtml(p.name)}
    </div>
    <div style="display:grid;gap:6px">
      <div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Company</span>
        <span style="font-size:11px;color:#e8edf5">${escapeHtml(p.company)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Category</span>
        <span style="font-size:11px;color:${escapeHtml(CATEGORY_COLOR[p.category] || '#e8edf5')}">${escapeHtml(categoryLabel(p.category))}</span>
      </div>
      <div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Status</span>
        <span style="font-size:11px;color:#e8edf5">${escapeHtml(statusLabel(p.status))}</span>
      </div>
      ${
        p.powerMw != null
          ? `<div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Power</span>
        <span style="font-size:11px;color:#e8edf5">${escapeHtml(fmtMw(p.powerMw))}</span>
      </div>`
          : ''
      }
      ${
        p.investmentUsdM != null
          ? `<div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Investment</span>
        <span style="font-size:11px;color:#e8edf5">${escapeHtml(fmtUsd(p.investmentUsdM))}</span>
      </div>`
          : ''
      }
      ${
        p.city
          ? `<div style="display:flex;justify-content:space-between;gap:12px">
        <span style="opacity:.55;font-size:9px;letter-spacing:.08em;text-transform:uppercase">Location</span>
        <span style="font-size:11px;color:#e8edf5">${escapeHtml(p.city)}${p.countryName ? `, ${escapeHtml(p.countryName)}` : ''}</span>
      </div>`
          : ''
      }
    </div>
  </div>`;
}

function markerHtml({ color, selected, live }) {
  const ring = `${color}66`;
  return `<div style="position:relative;width:22px;height:22px;border-radius:50%;background:rgba(10,12,18,.92);border:2px solid ${color};display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${ring}">
    ${live ? `<span style="position:absolute;inset:-10px;border-radius:50%;border:1px solid ${color};opacity:.35;animation:dcPulse 2.1s ease-out infinite"></span>` : ''}
    <span style="width:${selected ? 7 : 6}px;height:${selected ? 7 : 6}px;border-radius:50%;background:${color};box-shadow:0 0 8px ${ring}"></span>
  </div>`;
}

export function LeafletWorldMap({ projects, selectedId, onSelect, region = 'world', className = '' }) {
  const hostRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersByIdRef = useRef(new Map());

  const regionView = REGION_VIEWS[region] || REGION_VIEWS.world;

  const points = useMemo(
    () =>
      (projects || [])
        .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        .map((p) => ({
          id: p.id,
          project: p,
          lat: p.latitude,
          lon: p.longitude,
          color: CATEGORY_COLOR[p.category] || '#e8ecef',
          live: p.status === 'operational',
        })),
    [projects],
  );

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return undefined;

    const map = L.map(el, {
      center: regionView.center,
      zoom: regionView.zoom,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      dragging: true,
      minZoom: 2,
      maxZoom: 18,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIB, subdomains: 'abcd', maxZoom: 20 }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      markersByIdRef.current = new Map();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setView(regionView.center, regionView.zoom, { animate: true });
  }, [regionView.center, regionView.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerRef.current;
    if (!map || !group) return;

    group.clearLayers();
    markersByIdRef.current = new Map();

    for (const p of points) {
      const icon = L.divIcon({
        className: 'tos-leaflet-divicon',
        html: markerHtml({ color: p.color, selected: selectedId === p.id, live: p.live }),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([p.lat, p.lon], { icon, zIndexOffset: selectedId === p.id ? 500 : 0 }).addTo(group);
      marker.on('click', () => onSelect?.(p.project));
      marker.bindPopup(projectPopupHtml(p.project), {
        maxWidth: 340,
        className: 'tos-leaflet-popup-wrap',
        closeButton: true,
      });
      markersByIdRef.current.set(p.id, marker);
    }
  }, [points, onSelect, selectedId]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = selectedId ? markersByIdRef.current.get(selectedId) : null;
    if (!map || !marker) return;
    const ll = marker.getLatLng();
    map.panTo(ll, { animate: true, duration: 0.35 });

    // Open the selected marker popup for quick context (keeps selection behavior unchanged).
    // Close any other open popups first so the UI stays clean.
    map.closePopup();
    marker.openPopup();
  }, [selectedId]);

  return (
    <div className={cx(s.mapWrap, className)}>
      <div ref={hostRef} className={cx('tos-tracking-map', s.leafletHost)} />
    </div>
  );
}

export default LeafletWorldMap;

