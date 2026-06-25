// ================================================================
// WorldMap — dark geographic world map rendered as SVG with
// pre-baked GeoJSON land geometry (no runtime map libs). Accepts
// an array of projects and renders one marker per project.
// ================================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  project,
  geometryToPath,
  MAP_VIEW_WIDTH,
  MAP_VIEW_HEIGHT,
  REGION_VIEWPORTS,
} from '../utils/projection.js';
import { cx, fmtMw, fmtUsd, statusLabel, categoryLabel, CATEGORY_COLOR } from '../utils/format.js';
import { WORLD_COUNTRIES } from '../data/world-countries.js';
import s from '../styles/map.module.css';

export function WorldMap({
  projects,
  selectedId,
  onSelect,
  region = 'world',
  className = '',
}) {
  // Pre-compute country paths once. Baked data is static.
  const countryPaths = useMemo(
    () =>
      WORLD_COUNTRIES.map((c, i) => ({
        key: (c.id ?? 'c') + '-' + i,
        name: c.name,
        d: geometryToPath(c.geometry),
      })),
    [],
  );

  // Pre-compute marker positions.
  const markers = useMemo(
    () =>
      (projects || []).map((p) => {
        const [x, y] = project(p.longitude, p.latitude);
        return { project: p, x, y };
      }),
    [projects],
  );

  const vp = REGION_VIEWPORTS[region] || REGION_VIEWPORTS.world;
  const viewBox = `${vp.x} ${vp.y} ${vp.w} ${vp.h}`;

  // Hover tooltip state
  const [hover, setHover] = useState(null); // { project, screenX, screenY }
  const wrapRef = useRef(null);

  const handleMarkerEnter = (m, evt) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setHover({
      project: m.project,
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    });
  };
  const handleMarkerMove = (evt) => {
    if (!hover || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setHover((h) => (h ? { ...h, x: evt.clientX - rect.left, y: evt.clientY - rect.top } : h));
  };
  const handleMarkerLeave = () => setHover(null);

  // Bump selected marker to the end so it renders on top
  const orderedMarkers = useMemo(() => {
    if (!selectedId) return markers;
    const sel = markers.find((m) => m.project.id === selectedId);
    if (!sel) return markers;
    return [...markers.filter((m) => m.project.id !== selectedId), sel];
  }, [markers, selectedId]);

  // Scale markers inversely with zoom so they stay visually consistent
  const zoomFactor = vp.w / MAP_VIEW_WIDTH;
  const markerR = Math.max(2.2, 4.4 * Math.sqrt(zoomFactor));
  const markerPulseR = markerR * 1.8;

  return (
    <div ref={wrapRef} className={cx(s.mapWrap, className)} onMouseMove={handleMarkerMove}>
      <svg
        className={s.mapSvg}
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="AI Data Center world map"
      >
        <defs>
          <radialGradient id="dcMapOceanGlow" cx="50%" cy="50%" r="70%">
            <stop offset="0%"  stopColor="#101921" stopOpacity="1" />
            <stop offset="100%" stopColor="#0a0d11" stopOpacity="1" />
          </radialGradient>
          <pattern id="dcMapGrid" x="0" y="0" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.025)" strokeWidth="0.5" />
          </pattern>
        </defs>

        {/* Ocean */}
        <rect x="0" y="0" width={MAP_VIEW_WIDTH} height={MAP_VIEW_HEIGHT} fill="url(#dcMapOceanGlow)" />
        <rect x="0" y="0" width={MAP_VIEW_WIDTH} height={MAP_VIEW_HEIGHT} fill="url(#dcMapGrid)" />

        {/* Equator + Tropics — very subtle */}
        <line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(255,255,255,0.04)" strokeWidth="0.4" />
        <line x1="0" y1="186" x2="1000" y2="186" stroke="rgba(255,255,255,0.025)" strokeWidth="0.3" strokeDasharray="2 3" />
        <line x1="0" y1="314" x2="1000" y2="314" stroke="rgba(255,255,255,0.025)" strokeWidth="0.3" strokeDasharray="2 3" />

        {/* Countries */}
        <g className={s.countries}>
          {countryPaths.map((c) => (
            <path key={c.key} d={c.d} className={s.country} />
          ))}
        </g>

        {/* Markers */}
        <g className={s.markers}>
          {orderedMarkers.map((m) => {
            const selected = selectedId === m.project.id;
            const color = CATEGORY_COLOR[m.project.category] || '#e8ecef';
            const isLive = m.project.status === 'operational';
            return (
              <g
                key={m.project.id}
                transform={`translate(${m.x.toFixed(2)}, ${m.y.toFixed(2)})`}
                className={cx(s.marker, selected && s['marker--selected'])}
                onMouseEnter={(e) => handleMarkerEnter(m, e)}
                onMouseLeave={handleMarkerLeave}
                onClick={() => onSelect?.(m.project)}
              >
                {isLive && (
                  <circle
                    r={markerPulseR}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.6"
                    className={s.markerPulse}
                    style={{ opacity: 0.55 }}
                  />
                )}
                <circle
                  r={selected ? markerR * 1.25 : markerR}
                  fill={color}
                  stroke="#0a0d11"
                  strokeWidth="0.8"
                  className={s.markerDot}
                />
                {selected && (
                  <circle
                    r={markerR * 2}
                    fill="none"
                    stroke={color}
                    strokeWidth="0.8"
                    opacity="0.8"
                  />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          className={s.tooltip}
          style={{
            left: hover.x + 14,
            top: hover.y + 14,
          }}
        >
          <div className={s.tooltip__title}>{hover.project.name}</div>
          <div className={s.tooltip__row}>
            <span className={s.tooltip__label}>COMPANY</span>
            <span>{hover.project.company}</span>
          </div>
          <div className={s.tooltip__row}>
            <span className={s.tooltip__label}>CATEGORY</span>
            <span style={{ color: CATEGORY_COLOR[hover.project.category] }}>
              {categoryLabel(hover.project.category)}
            </span>
          </div>
          <div className={s.tooltip__row}>
            <span className={s.tooltip__label}>STATUS</span>
            <span>{statusLabel(hover.project.status)}</span>
          </div>
          {hover.project.powerMw != null && (
            <div className={s.tooltip__row}>
              <span className={s.tooltip__label}>POWER</span>
              <span>{fmtMw(hover.project.powerMw)}</span>
            </div>
          )}
          {hover.project.investmentUsdM != null && (
            <div className={s.tooltip__row}>
              <span className={s.tooltip__label}>INVESTMENT</span>
              <span>{fmtUsd(hover.project.investmentUsdM)}</span>
            </div>
          )}
          {hover.project.city && (
            <div className={s.tooltip__row}>
              <span className={s.tooltip__label}>LOCATION</span>
              <span>
                {hover.project.city}
                {hover.project.countryName ? ', ' + hover.project.countryName : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
