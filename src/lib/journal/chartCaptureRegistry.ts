/**
 * The chart screen registers a capture function for the visible frame
 * (candles + overlay canvases + SVG drawings). The quick-journal sheet
 * calls it without importing ChartScreen.
 */

export type ChartFrameCapture = () => Promise<Blob | null>;

let capture: ChartFrameCapture | null = null;

export function registerChartFrameCapture(fn: ChartFrameCapture | null): void {
  capture = fn;
}

export function captureRegisteredChartFrame(): Promise<Blob | null> {
  if (!capture) return Promise.resolve(null);
  return capture().catch(() => null);
}

export function hasRegisteredChartFrameCapture(): boolean {
  return capture != null;
}

function svgToImage(svg: SVGElement): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    try {
      const clone = svg.cloneNode(true) as SVGElement;
      if (!clone.getAttribute("xmlns")) {
        clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      }
      const xml = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    } catch {
      resolve(null);
    }
  });
}

/** Composite every canvas and SVG inside `root` into one PNG blob. */
export async function captureElementFrame(root: HTMLElement): Promise<Blob | null> {
  const rect = root.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const scale = Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  const out = document.createElement("canvas");
  out.width = Math.round(width * scale);
  out.height = Math.round(height * scale);
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  const bg = getComputedStyle(root).backgroundColor || "#0a0a0e";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const nodes = Array.from(root.querySelectorAll("canvas, svg"));
  for (const node of nodes) {
    const r = node.getBoundingClientRect();
    const x = r.left - rect.left;
    const y = r.top - rect.top;
    if (r.width < 2 || r.height < 2) continue;
    if (node instanceof HTMLCanvasElement) {
      try {
        ctx.drawImage(node, x, y, r.width, r.height);
      } catch {
        /* tainted or empty */
      }
      continue;
    }
    if (node instanceof SVGElement) {
      const img = await svgToImage(node);
      if (img) {
        try {
          ctx.drawImage(img, x, y, r.width, r.height);
        } catch {
          /* ignore */
        }
      }
    }
  }

  return await new Promise((resolve) => {
    out.toBlob((blob) => resolve(blob), "image/png");
  });
}
