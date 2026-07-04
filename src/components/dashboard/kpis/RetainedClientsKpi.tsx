import { KpiCardBase } from "./KpiCardBase.tsx";

interface RetainedClientsKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function RetainedClientsKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: RetainedClientsKpiProps) {
  return (
    <KpiCardBase
      label="Retained Clients 💵"
      value={value !== null ? value.toLocaleString() : "--"}
      description="renewed/extended/upgraded their contract with our business"
      infoDescription={
        "Shows clients with retention activity, such as renewing, extending, or upgrading. Dashboard filters and the selected date range determine which clients are included."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
