import { KpiCardBase } from "./KpiCardBase.tsx";

interface PausedClientsKpiProps {
  value: number | null;
  label: string;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function PausedClientsKpi({
  value,
  label,
  loading,
  onOpenInfo,
  onOpenList,
}: PausedClientsKpiProps) {
  return (
    <KpiCardBase
      label={`${label} Clients ⏸️`}
      value={value !== null ? value.toLocaleString() : "--"}
      description={`clients currently marked as ${label}`}
      infoDescription={`Shows clients currently marked as ${label} after the selected dashboard filters are applied. ${label} is this workspace's display name for the underlying Paused status.`}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
