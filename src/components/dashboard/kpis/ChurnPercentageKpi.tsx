import { KpiCardBase } from "./KpiCardBase.tsx";

interface ChurnPercentageKpiProps {
  percentage: number | null;
  churnedClientsCount: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function ChurnPercentageKpi({
  percentage,
  churnedClientsCount,
  loading,
  onOpenInfo,
  onOpenList,
}: ChurnPercentageKpiProps) {
  const value = percentage !== null ? `${percentage}%` : "--";
  const description =
    churnedClientsCount !== null
      ? `${churnedClientsCount.toLocaleString()} churned clients`
      : "churned clients";

  return (
    <KpiCardBase
      label="Churn Percentage 🔋"
      value={value}
      description={description}
      descriptionLoading={loading}
      infoDescription={
        "Shows churned clients as a percentage of the active and off-boarded client base in the selected filter context. A client is treated as churned when they off-board before the expected contract or program end."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
