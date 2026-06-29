import { headers } from "next/headers";
import { WalletsAppKitProvider } from "@/components/wallets/WalletsAppKitProvider";
import { WalletsClient } from "@/components/wallets/WalletsClient";

export default async function WalletsPage() {
  const cookieHeader = (await headers()).get("cookie");

  return (
    <WalletsAppKitProvider cookies={cookieHeader}>
      <WalletsClient />
    </WalletsAppKitProvider>
  );
}
