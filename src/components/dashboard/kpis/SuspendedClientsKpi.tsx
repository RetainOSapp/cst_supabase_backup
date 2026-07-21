import { KpiCardBase } from "./KpiCardBase.tsx";

interface SuspendedClientsKpiProps {
  value: number | null;
  label: string;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function SuspendedClientsKpi({
  value,
  label,
  loading,
  onOpenInfo,
  onOpenList,
}: SuspendedClientsKpiProps) {
  const cardLabel = `${label} Clients 🚨`;

  return (
    <KpiCardBase
      label={cardLabel}
      value={value !== null ? value.toLocaleString() : "--"}
      description={`clients currently marked as ${label}`}
      infoDescription={`Shows clients currently marked as ${label} after the selected dashboard filters are applied. ${label} is this workspace's display name for the underlying Suspended status, so the metric remains consistent even when the status is renamed.`}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
