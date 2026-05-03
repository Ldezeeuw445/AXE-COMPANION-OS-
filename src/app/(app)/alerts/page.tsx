import { AlertsClient } from "@/components/alerts/AlertsClient";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { listAlerts } from "@/services/alertsService";

export default async function AlertsPage() {
  const alerts = await listAlerts();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScreenHeader
        title="Alerts"
        subtitle="Terminal → companion feed"
      />
      <AlertsClient initialAlerts={alerts} />
    </div>
  );
}
