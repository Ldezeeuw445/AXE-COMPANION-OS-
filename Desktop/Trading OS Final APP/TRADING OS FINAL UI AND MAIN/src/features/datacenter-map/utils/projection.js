// ================================================================
// Geographic helpers.
//
// We use a plate-carrée (equirectangular) projection because it
// maps directly to GeoJSON lon/lat coordinates with zero deps and
// renders crisply as SVG paths. viewBox is a fixed 1000x500 box
// (2:1 like the Earth). All downstream components work in that
// coordinate space.
// ================================================================

export const MAP_VIEW_WIDTH = 1000;
export const MAP_VIEW_HEIGHT = 500;

/** Convert [lon, lat] to [x, y] in viewBox space. */
export function project(lon, lat) {
  const x = ((lon + 180) / 360) * MAP_VIEW_WIDTH;
  const y = ((90 - lat) / 180) * MAP_VIEW_HEIGHT;
  return [x, y];
}

/** Build an SVG path "d" string from a GeoJSON polygon ring. */
function ringToPath(ring) {
  if (!ring.length) return '';
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const [x, y] = project(lon, lat);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  return d + 'Z';
}

/**
 * Convert a GeoJSON geometry (Polygon | MultiPolygon) to a single
 * SVG path string. Non-polygon geometries are skipped.
 */
export function geometryToPath(geom) {
  if (!geom) return '';
  if (geom.type === 'Polygon') {
    return geom.coordinates.map(ringToPath).join(' ');
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates
      .flat()
      .map(ringToPath)
      .join(' ');
  }
  return '';
}

/** Region-level viewBox windows for the tab zoom. */
export const REGION_VIEWPORTS = {
  world:      { x: 0,   y: 10,  w: MAP_VIEW_WIDTH, h: MAP_VIEW_HEIGHT - 20 },
  n_america:  { x: 90,  y: 50,  w: 290,            h: 250 },
  europe:     { x: 440, y: 60,  w: 180,            h: 170 },
  asia:       { x: 600, y: 70,  w: 300,            h: 220 },
  middle_east:{ x: 530, y: 130, w: 160,            h: 130 },
};
