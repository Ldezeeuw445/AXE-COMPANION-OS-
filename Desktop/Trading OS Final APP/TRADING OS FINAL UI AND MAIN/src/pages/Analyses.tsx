import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PieChart, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { AnalysesLibrary } from '@/features/analyses-library';
import { createStubAnalysesDataSource } from '@/features/analyses-library/examples/StubAnalysesDataSource';

const SentIcon = ({ s }: { s: string }) => {
  if (s === 'bullish') return <TrendingUp size={12} className="text-green-400" />;
  if (s === 'bearish') return <TrendingDown size={12} className="text-red-400" />;
  return <Minus size={12} className="text-white/30" />;
};

function AnalysesHeader() {
  return (
    <div className="flex shrink-0 flex-col border-b border-white/5">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <PieChart size={14} className="text-cyan-400" />
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">ANALYSES</span>
        </div>
      </div>
      <div className="border-t border-amber-500/15 bg-amber-500/5 px-4 py-1.5 text-[10px] text-amber-200/90">
        PLACEHOLDER: analyses list/detail use StubAnalysesDataSource — no engineAdapter API.
      </div>
    </div>
  );
}

type StubAnalysis = {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  symbols: string[];
  author?: string;
  bias?: string;
};

type AnalysesDataSource = {
  listAnalyses(): Promise<StubAnalysis[]>;
};

export default function Analyses() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const ds = useMemo(
    () => createStubAnalysesDataSource() as AnalysesDataSource,
    [],
  );
  const [detail, setDetail] = useState<StubAnalysis | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setDetail(null);
      setLoadErr(null);
      return;
    }
    setLoadErr(null);
    let cancelled = false;
    ds.listAnalyses()
      .then((list: StubAnalysis[]) => {
        if (cancelled) return;
        const found = list.find((a) => a.id === id) ?? null;
        setDetail(found);
        if (!found) setLoadErr('Analysis not found');
      })
      .catch(() => {
        if (!cancelled) setLoadErr('Failed to load analysis');
      });
    return () => {
      cancelled = true;
    };
  }, [ds, id]);

  if (id) {
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
        <AnalysesHeader />
        <div className="flex min-h-0 flex-1 items-start justify-between gap-3 overflow-y-auto px-4 py-3 scrollbar-hide">
          <div className="min-w-0 flex-1">
            {loadErr && <p className="text-sm text-white/50">{loadErr}</p>}
            {detail && (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <SentIcon s={detail.bias === 'short' ? 'bearish' : detail.bias === 'long' ? 'bullish' : 'neutral'} />
                  <span className="text-[10px] font-medium text-white/50">
                    {(detail.bias ?? '—').toString().toUpperCase()}
                  </span>
                </div>
                <h2 className="mb-2 text-base font-bold text-white/90">{detail.title}</h2>
                <p className="text-xs leading-relaxed text-white/60">{detail.summary}</p>
                <div className="mt-4 flex flex-wrap gap-1">
                  {detail.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded border border-cyan-500/20 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] text-cyan-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigate('/analyses')}
            className="shrink-0 text-[10px] text-white/40 hover:text-white/70"
          >
            ← Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-[#0a0a0a]">
      <AnalysesHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        <AnalysesLibrary
          dataSource={ds}
          onOpenAnalysis={(a: { id: string }) => navigate(`/analyses/${a.id}`)}
        />
      </div>
    </div>
  );
}
