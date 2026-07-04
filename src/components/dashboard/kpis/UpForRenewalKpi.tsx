import {
  type DashboardKpiSqlParams,
  getUpForRenewalSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface UpForRenewalKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList?: () => void;
}

export function UpForRenewalKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: UpForRenewalKpiProps) {
  return (
    <KpiCardBase
      label="Up for Renewal 📆"
      value={value !== null ? value.toLocaleString() : "--"}
      description="active clients up for renewal"
      infoDescription={
        "Starts from clients with a current or historical contract end date in the selected Date Range. When no Date Range is set, the default renewal window is overdue through the next 30 days. It excludes churned, paused, and suspended clients, limits to Front End and Back End clients, and removes anyone already counted as retained for the same window."
      }
      infoSql={getUpForRenewalSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
