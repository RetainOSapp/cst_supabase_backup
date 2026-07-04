import { KpiCardBase } from "./KpiCardBase.tsx";

interface OffBoardedClientsKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function OffBoardedClientsKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: OffBoardedClientsKpiProps) {
  return (
    <KpiCardBase
      label="Off-boarded Clients 📁"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients offboarded"
      infoDescription={
        "Shows clients currently marked as Off-boarded after the selected dashboard filters are applied. When a dashboard date range is selected, this focuses on clients off-boarded in that period."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
