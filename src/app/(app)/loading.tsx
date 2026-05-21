import { AxeLoadingPanel } from "@/components/ui/AxeBreatheLoader";

export default function AppLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 py-2">
      <AxeLoadingPanel label="Restoring workspace" />
    </div>
  );
}
