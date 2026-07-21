import { KpiCardBase } from "./KpiCardBase.tsx";

interface RetentionPercentageKpiProps {
  percentage: number | null;
  renewingClientsCount: number | null;
  isCohortBased: boolean;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function RetentionPercentageKpi({
  percentage,
  renewingClientsCount,
  isCohortBased,
  loading,
  onOpenInfo,
  onOpenList,
}: RetentionPercentageKpiProps) {
  const value = percentage !== null ? `${percentage}%` : "--";
  const description =
    renewingClientsCount !== null
      ? isCohortBased
        ? `of ${renewingClientsCount.toLocaleString()} contracts ending in period`
        : `of ${renewingClientsCount.toLocaleString()} clients up for renewal`
      : isCohortBased
        ? "of contracts ending in period"
        : "of clients up for renewal";

  return (
    <KpiCardBase
      label="Retention Percentage ☀️"
      value={value}
      description={description}
      descriptionLoading={loading}
      infoDescription={
        isCohortBased
          ? "Shows retained clients as a percentage of the contracts ending in the selected period. Each retention outcome is matched to its expiring contract, so a retention event from a different period cannot inflate this percentage."
          : "Shows retained clients as a percentage of clients up for renewal. When no date range is selected, the renewal window defaults to overdue clients plus the next 30 days."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
