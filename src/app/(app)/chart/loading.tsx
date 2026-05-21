import { AxeLoadingPanel } from "@/components/ui/AxeBreatheLoader";

export default function ChartLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
      <AxeLoadingPanel label="AXE Chart Loading" />
    </div>
  );
}
