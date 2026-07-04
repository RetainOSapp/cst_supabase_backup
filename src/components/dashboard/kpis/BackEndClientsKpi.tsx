import { KpiCardBase } from "./KpiCardBase.tsx";

interface BackEndClientsKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function BackEndClientsKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: BackEndClientsKpiProps) {
  return (
    <KpiCardBase
      label="Back End Clients 🥈"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in back end"
      infoDescription={
        "Shows clients currently marked as Back End after the selected dashboard filters are applied. This is the active group that has moved into the later part of the client journey."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
