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
        "Starts from the clients up for renewal (any contract end date in the selected Date Range, excluding churned, paused, and suspended clients). Then limits to clients whose current program status is front-end or back-end, and removes anyone who has already been upgraded (clients counted in Retained Clients for the selected range). The remaining list is who you still need to talk to about renewing."
      }
      infoSql={getUpForRenewalSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
