import {
  type DashboardKpiSqlParams,
  getChurnPercentageSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface ChurnPercentageKpiProps {
  percentage: number | null;
  churnedClientsCount: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList: () => void;
}

export function ChurnPercentageKpi({
  percentage,
  churnedClientsCount,
  loading,
  sqlParams,
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
        "Starts from off-boarded clients, then marks churned clients where calculated off-boarded date is before calculated contractual end date. Percentage is churned clients divided by total clients (front-end + back-end + off-boarded) under the same filter context."
      }
      infoSql={getChurnPercentageSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
