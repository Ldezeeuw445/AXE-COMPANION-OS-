import { useState, useRef, useCallback, useEffect } from 'react';
import { Plus, Minus, Navigation, Anchor } from 'lucide-react';

// ── Realistic World Map Paths (country outlines) ──
const WORLD_PATHS = [
  // North America - USA
  "M15,30 L20,25 L35,22 L55,20 L75,25 L90,30 L95,35 L92,42 L85,48 L78,52 L72,55 L65,58 L55,56 L48,52 L42,48 L35,42 L28,38 L22,35 L18,32 Z",
  // North America - Canada
  "M15,15 L25,10 L40,8 L55,10 L70,12 L82,16 L88,22 L85,28 L78,30 L72,28 L65,26 L55,24 L45,22 L35,20 L25,18 Z",
  // Mexico
  "M35,52 L42,48 L48,52 L50,58 L48,65 L42,70 L38,68 L35,62 Z",
  // South America
  "M52,72 L58,70 L65,72 L72,80 L78,92 L80,105 L78,118 L72,125 L65,128 L58,122 L52,110 L48,95 L50,82 Z",
  // Europe
  "M102,22 L108,18 L115,18 L125,20 L132,22 L138,26 L142,30 L140,35 L138,38 L132,40 L125,38 L118,36 L112,34 L108,30 L105,26 Z",
  // UK
  "M98,28 L102,25 L104,28 L102,33 L100,35 L98,32 Z",
  // Scandinavia
  "M115,12 L122,8 L128,10 L132,16 L130,22 L128,26 L125,28 L120,26 L118,20 L116,15 Z",
  // Russia/Western Asia
  "M142,18 L158,12 L178,14 L198,18 L218,22 L235,28 L248,35 L252,42 L248,48 L240,52 L228,54 L215,52 L200,48 L185,44 L172,40 L160,36 L150,32 L145,28 Z",
  // Middle East
  "M138,42 L145,40 L152,44 L158,50 L162,56 L160,62 L155,64 L148,62 L142,56 L138,48 Z",
  // India
  "M168,50 L178,48 L185,54 L188,62 L190,70 L188,76 L182,80 L175,78 L170,72 L166,62 Z",
  // China
  "M195,32 L210,28 L225,30 L238,36 L245,42 L248,48 L245,54 L238,58 L228,60 L218,58 L208,54 L200,48 L195,40 Z",
  // Japan
  "M252,30 L256,26 L258,32 L256,38 L254,42 L250,38 Z",
  // Korea
  "M245,38 L248,36 L250,40 L248,44 L245,42 Z",
  // Southeast Asia
  "M198,60 L208,56 L218,60 L222,68 L218,76 L212,80 L205,78 L200,72 L198,66 Z",
  // Indonesia
  "M195,78 L210,76 L220,80 L225,86 L220,90 L210,88 L200,84 Z",
  // Australia
  "M215,92 L230,90 L242,94 L248,102 L245,112 L232,118 L218,116 L210,108 L212,98 Z",
  // New Zealand
  "M245,115 L250,112 L252,118 L248,122 Z",
  // Africa - North
  "M108,42 L118,40 L128,44 L135,48 L140,52 L138,60 L132,66 L125,68 L118,66 L112,60 L108,52 Z",
  // Africa - Sub-Saharan
  "M112,66 L125,68 L132,72 L138,80 L140,92 L138,105 L132,118 L125,125 L118,128 L112,122 L108,110 L105,95 L108,80 Z",
  // South Africa
  "M118,128 L125,125 L132,130 L130,138 L125,142 L118,140 L115,135 Z",
];

// Country labels for major countries
const COUNTRY_LABELS = [
  { name: 'UNITED STATES', x: 55, y: 38 },
  { name: 'CANADA', x: 50, y: 18 },
  { name: 'MEXICO', x: 42, y: 58 },
  { name: 'BRAZIL', x: 65, y: 95 },
  { name: 'ARGENTINA', x: 60, y: 115 },
  { name: 'COLOMBIA', x: 52, y: 78 },
  { name: 'PERU', x: 48, y: 90 },
  { name: 'UK', x: 100, y: 28 },
  { name: 'FRANCE', x: 110, y: 30 },
  { name: 'GERMANY', x: 118, y: 26 },
  { name: 'ITALY', x: 122, y: 32 },
  { name: 'SPAIN', x: 108, y: 34 },
  { name: 'NORWAY', x: 118, y: 14 },
  { name: 'SWEDEN', x: 124, y: 12 },
  { name: 'RUSSIA', x: 195, y: 20 },
  { name: 'CHINA', x: 220, y: 40 },
  { name: 'INDIA', x: 178, y: 58 },
  { name: 'JAPAN', x: 255, y: 34 },
  { name: 'AUSTRALIA', x: 232, y: 105 },
  { name: 'SAUDI ARABIA', x: 148, y: 50 },
  { name: 'UAE', x: 155, y: 52 },
  { name: 'EGYPT', x: 132, y: 48 },
  { name: 'SOUTH AFRICA', x: 125, y: 135 },
  { name: 'NIGERIA', x: 120, y: 75 },
  { name: 'TURKEY', x: 140, y: 35 },
  { name: 'IRAN', x: 155, y: 42 },
  { name: 'INDONESIA', x: 215, y: 82 },
  { name: 'THAILAND', x: 210, y: 62 },
  { name: 'VIETNAM', x: 218, y: 58 },
  { name: 'KOREA', x: 248, y: 38 },
];

export interface MapMarker {
  id: string;
  lat: number;
  lon: number;
  color: string;
  label: string;
  details?: Record<string, string>;
  icon?: 'plane' | 'ship' | 'dot' | 'pin';
}

interface InteractiveMapProps {
  markers: MapMarker[];
  height?: number;
  defaultZoom?: number;
  showLabels?: boolean;
}

export default function InteractiveMap({ markers, height = 280, defaultZoom = 1, showLabels = true }: InteractiveMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(defaultZoom);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [hoveredMarker, setHoveredMarker] = useState<MapMarker | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(500);
  const dragStart = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.clientWidth || 500);
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lonToX = (lon: number) => ((lon + 180) / 360) * 360;
  const latToY = (lat: number) => ((90 - lat) / 180) * 180;

  const markerPos = (lat: number, lon: number) => {
    const x = lonToX(lon) * zoom + pan.x;
    const y = latToY(lat) * zoom + pan.y;
    return { x, y };
  };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    panStart.current = { ...pan };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (dragging) {
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({ x: panStart.current.x + dx, y: panStart.current.y + dy });
    }
  }, [dragging]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.4), 8);
    const scaleRatio = newZoom / zoom;
    setZoom(newZoom);
    setPan({ x: mouseX - (mouseX - pan.x) * scaleRatio, y: mouseY - (mouseY - pan.y) * scaleRatio });
  }, [zoom, pan]);

  const zoomIn = () => {
    const newZoom = Math.min(zoom * 1.3, 8);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2, cy = rect.height / 2;
      const scaleRatio = newZoom / zoom;
      setPan({ x: cx - (cx - pan.x) * scaleRatio, y: cy - (cy - pan.y) * scaleRatio });
    }
    setZoom(newZoom);
  };

  const zoomOut = () => {
    const newZoom = Math.max(zoom / 1.3, 0.4);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const cx = rect.width / 2, cy = rect.height / 2;
      const scaleRatio = newZoom / zoom;
      setPan({ x: cx - (cx - pan.x) * scaleRatio, y: cy - (cy - pan.y) * scaleRatio });
    }
    setZoom(newZoom);
  };

  const resetView = () => { setZoom(defaultZoom); setPan({ x: 0, y: 0 }); };

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-lg border border-white/[0.06] overflow-hidden bg-[#060a10] select-none"
      style={{ height, cursor: dragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* World Map Layer */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 360 180"
        preserveAspectRatio="none"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: '0 0',
        }}
      >
        {/* Grid */}
        {Array.from({ length: 19 }, (_, i) => (
          <g key={i} opacity="0.03">
            <line x1={0} y1={i * 10} x2={360} y2={i * 10} stroke="white" strokeWidth="0.3" />
            <line x1={i * 20} y1={0} x2={i * 20} y2={180} stroke="white" strokeWidth="0.3" />
          </g>
        ))}

        {/* Continents */}
        {WORLD_PATHS.map((path, i) => (
          <path
            key={i}
            d={path}
            fill="rgba(25,30,40,0.9)"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="0.4"
          />
        ))}

        {/* Country labels */}
        {showLabels && zoom >= 0.8 && COUNTRY_LABELS.map(c => (
          <text key={c.name} x={c.x} y={c.y} fontSize={zoom > 1.5 ? "3" : "2.5"} fill="rgba(255,255,255,0.15)" textAnchor="middle" fontWeight="500">
            {c.name}
          </text>
        ))}
      </svg>

      {/* Markers Layer */}
      <div style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: '0 0' }} className="absolute inset-0">
        {markers.map(m => {
          const pos = markerPos(m.lat, m.lon);
          const isHovered = hoveredMarker?.id === m.id;
          return (
            <div
              key={m.id}
              className="absolute"
              style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: isHovered ? 20 : 10 }}
              onMouseEnter={() => setHoveredMarker(m)}
              onMouseLeave={() => setHoveredMarker(null)}
            >
              {isHovered && (
                <div className="absolute rounded-full animate-ping" style={{ width: 24, height: 24, backgroundColor: m.color, opacity: 0.25, top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
              )}

              {m.icon === 'plane' ? (
                <div className="relative flex items-center justify-center drop-shadow-lg" style={{ width: 18, height: 18 }}>
                  <Navigation size={14} style={{ color: m.color, transform: `rotate(${m.details?.heading || '45'}deg)` }} />
                </div>
              ) : m.icon === 'ship' ? (
                <div className="relative flex items-center justify-center">
                  <Anchor size={14} style={{ color: m.color }} />
                </div>
              ) : m.icon === 'pin' ? (
                <div className="relative flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border-2 border-white/30" style={{ backgroundColor: m.color, boxShadow: `0 0 8px ${m.color}60` }} />
                </div>
              ) : (
                <div className="rounded-full transition-all" style={{
                  width: isHovered ? 12 : 8, height: isHovered ? 12 : 8,
                  backgroundColor: m.color, boxShadow: `0 0 ${isHovered ? 10 : 5}px ${m.color}70`,
                  border: '1.5px solid rgba(255,255,255,0.4)', transition: 'all 0.15s',
                }} />
              )}
            </div>
          );
        })}
      </div>

      {/* Zoom Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1 z-30">
        <button onClick={zoomIn} className="w-8 h-8 rounded-md bg-[#141418]/90 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white">
          <Plus size={16} />
        </button>
        <button onClick={zoomOut} className="w-8 h-8 rounded-md bg-[#141418]/90 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-white/50 hover:text-white">
          <Minus size={16} />
        </button>
        <button onClick={resetView} className="w-8 h-8 rounded-md bg-[#141418]/90 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors text-[10px] text-white/40 hover:text-white" title="Reset">
          ⌂
        </button>
      </div>

      {/* Zoom % indicator */}
      <div className="absolute bottom-3 left-3 z-30 px-2 py-1 rounded-md bg-[#141418]/90 border border-white/10">
        <span className="text-[9px] text-white/30">{Math.round(zoom * 100)}%</span>
      </div>

      {/* Hover Tooltip */}
      {hoveredMarker && (
        <div className="absolute z-50 pointer-events-none" style={{
          left: Math.min(mousePos.x + 14, containerWidth - 220),
          top: Math.max(mousePos.y - 100, 10),
        }}>
          <div className="px-3 py-2.5 rounded-xl bg-[#0f1016] border border-white/[0.12] shadow-2xl min-w-[200px] backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: hoveredMarker.color }} />
              <span className="text-[12px] font-semibold text-white/90">{hoveredMarker.label}</span>
            </div>
            {hoveredMarker.details && (
              <div className="space-y-1">
                {Object.entries(hoveredMarker.details).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <span className="text-[9px] text-white/30 uppercase tracking-wider">{key}</span>
                    <span className="text-[10px] text-white/70 font-medium">{val}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
