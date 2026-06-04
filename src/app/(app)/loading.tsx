import { FullScreenLoader } from "@/components/ui/FullScreenLoader";

export default function AppLoading() {
  return <FullScreenLoader autoFade={false} label="Restoring workspace…" />;
}
