/**
 * Squarified treemap algorithm (Bruls, Huijsen, van Wijk 2000).
 * Small, dependency-free implementation. Produces rectangles with
 * aspect ratios as close to 1 as possible, given a container and a
 * list of weighted items.
 */

function worstRatio(row, length) {
  const sum = row.reduce((s, r) => s + r.value, 0);
  if (sum === 0 || length === 0) return Infinity;
  let maxArea = -Infinity;
  let minArea = Infinity;
  for (const r of row) {
    if (r.value > maxArea) maxArea = r.value;
    if (r.value < minArea) minArea = r.value;
  }
  const s2 = sum * sum;
  const l2 = length * length;
  return Math.max((l2 * maxArea) / s2, s2 / (l2 * minArea));
}

function layoutRow(row, rect, horizontal) {
  const sum = row.reduce((s, r) => s + r.value, 0);
  const results = [];
  if (sum === 0) return { results, rect };
  if (horizontal) {
    // row along the top of rect (horizontal strip)
    const rowHeight = sum / rect.w;
    let x = rect.x;
    for (const r of row) {
      const w = r.value / rowHeight;
      results.push({ ...r, x, y: rect.y, w, h: rowHeight });
      x += w;
    }
    return {
      results,
      rect: {
        x: rect.x,
        y: rect.y + rowHeight,
        w: rect.w,
        h: rect.h - rowHeight,
      },
    };
  }
  // row along the left of rect (vertical strip)
  const rowWidth = sum / rect.h;
  let y = rect.y;
  for (const r of row) {
    const h = r.value / rowWidth;
    results.push({ ...r, x: rect.x, y, w: rowWidth, h });
    y += h;
  }
  return {
    results,
    rect: {
      x: rect.x + rowWidth,
      y: rect.y,
      w: rect.w - rowWidth,
      h: rect.h,
    },
  };
}

/**
 * Lay out items inside rect with squarified treemap.
 * @param {Array<{value:number}>} items must have .value > 0
 * @param {{x,y,w,h}} rect container
 * @returns Array of items with added x,y,w,h
 */
export function squarify(items, rect) {
  if (!items.length || rect.w <= 0 || rect.h <= 0) return [];
  // normalize item values to match rect area
  const totalValue = items.reduce((s, i) => s + i.value, 0);
  if (totalValue === 0) return [];
  const area = rect.w * rect.h;
  const scaled = items
    .map((i) => ({ ...i, value: (i.value / totalValue) * area }))
    .sort((a, b) => b.value - a.value);

  let current = { ...rect };
  let row = [];
  const placed = [];

  const shortSide = () => Math.min(current.w, current.h);
  const horizontal = () => current.w >= current.h;

  let i = 0;
  while (i < scaled.length) {
    const next = scaled[i];
    const len = shortSide();
    const withNext = [...row, next];
    const currentWorst = row.length ? worstRatio(row, len) : Infinity;
    const nextWorst = worstRatio(withNext, len);
    if (row.length === 0 || nextWorst <= currentWorst) {
      row = withNext;
      i += 1;
    } else {
      const { results, rect: newRect } = layoutRow(row, current, horizontal());
      placed.push(...results);
      row = [];
      current = newRect;
    }
  }
  if (row.length) {
    const { results } = layoutRow(row, current, horizontal());
    placed.push(...results);
  }
  return placed;
}

/**
 * Build full treemap: group tickers by sector, lay out sectors, then
 * lay out tickers inside each sector rectangle.
 */
export function buildTreemap(tickers, rect, getMetric, gap = 2, headerHeight = 18) {
  if (!tickers.length) return { sectors: [], nodes: [] };
  const bySector = new Map();
  for (const t of tickers) {
    const arr = bySector.get(t.sector) || [];
    arr.push(t);
    bySector.set(t.sector, arr);
  }

  const sectorItems = [];
  for (const [sector, arr] of bySector.entries()) {
    const value = arr.reduce((s, t) => s + Math.max(t.marketCap, 1), 0);
    sectorItems.push({ sector, value, tickers: arr });
  }

  const sectorRects = squarify(sectorItems, rect);

  const sectors = [];
  const nodes = [];
  for (const s of sectorRects) {
    // shrink by gap
    const sx = s.x + gap / 2;
    const sy = s.y + gap / 2;
    const sw = Math.max(s.w - gap, 0);
    const sh = Math.max(s.h - gap, 0);

    // reserve header space
    const innerRect = {
      x: sx,
      y: sy + headerHeight,
      w: sw,
      h: Math.max(sh - headerHeight, 0),
    };

    const tickerItems = s.tickers.map((t) => ({
      symbol: t.symbol,
      name: t.name,
      sector: t.sector,
      value: Math.max(t.marketCap, 1),
      raw: t,
    }));

    const laid = squarify(tickerItems, innerRect).map((n) => ({
      ...n,
      metricValue: getMetric(n.raw),
      x: n.x + gap / 2,
      y: n.y + gap / 2,
      w: Math.max(n.w - gap, 0),
      h: Math.max(n.h - gap, 0),
    }));

    sectors.push({
      sector: s.sector,
      value: s.value,
      x: sx,
      y: sy,
      w: sw,
      h: sh,
      tickers: laid,
    });
    nodes.push(...laid);
  }
  return { sectors, nodes };
}
