import { useSymbol } from '@/contexts/SymbolContext';
import HeatmapPage from '@/pages/HeatmapPage';

export default function Heatmap() {
  const { symbol } = useSymbol();
  return <HeatmapPage contextSymbol={symbol} />;
}
