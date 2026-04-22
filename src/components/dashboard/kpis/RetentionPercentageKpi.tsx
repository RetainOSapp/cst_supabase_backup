import {
  type DashboardKpiSqlParams,
  getRetentionPercentageSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface RetentionPercentageKpiProps {
  percentage: number | null;
  renewingClientsCount: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList: () => void;
}

export function RetentionPercentageKpi({
  percentage,
  renewingClientsCount,
  loading,
  sqlParams,
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
        "Retention percentage is retained clients divided by clients up for renewal. Clients up for renewal are those whose current contract end date (calculated) or any past contract end date falls within the selected Date Range (or any end date when no range is set), excluding clients who are currently churned and those whose program status is paused or suspended."
      }
      infoSql={getRetentionPercentageSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
