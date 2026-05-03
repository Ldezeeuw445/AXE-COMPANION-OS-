import { VaultClient } from "@/components/vault/VaultClient";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { listVaultMedia, listVaultNotes } from "@/services/vaultService";

export default async function VaultPage() {
  const [notes, media] = await Promise.all([
    listVaultNotes(),
    listVaultMedia(),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Vault"
        subtitle="Notes, screenshots, voice — yours only"
      />
      <VaultClient notes={notes} media={media} />
    </div>
  );
}
