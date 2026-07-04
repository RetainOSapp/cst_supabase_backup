import { KpiCardBase } from "./KpiCardBase.tsx";

interface RetentionPercentageKpiProps {
  percentage: number | null;
  renewingClientsCount: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function RetentionPercentageKpi({
  percentage,
  renewingClientsCount,
  loading,
  onOpenInfo,
  onOpenList,
}: RetentionPercentageKpiProps) {
  const value = percentage !== null ? `${percentage}%` : "--";
  const description =
    renewingClientsCount !== null
      ? `of ${renewingClientsCount.toLocaleString()} clients up for renewal`
      : "of clients up for renewal";

  return (
    <KpiCardBase
      label="Retention Percentage ☀️"
      value={value}
      description={description}
      descriptionLoading={loading}
      infoDescription={
        "Shows retained clients as a percentage of clients up for renewal in the selected period. When no date range is selected, the renewal window defaults to overdue clients plus the next 30 days."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
