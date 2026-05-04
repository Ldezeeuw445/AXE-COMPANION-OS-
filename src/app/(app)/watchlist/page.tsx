import { WatchlistPageScreen } from "@/components/watchlist/WatchlistPageScreen";
import { listWatchlistItems } from "@/app/(app)/settings/actions";

export default async function WatchlistPage() {
  const items = await listWatchlistItems();
  return <WatchlistPageScreen items={items} />;
}
