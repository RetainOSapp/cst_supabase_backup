import {
  type DashboardKpiSqlParams,
  getRetainedClientsSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface RetainedClientsKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList: () => void;
}

export function RetainedClientsKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: RetainedClientsKpiProps) {
  return (
    <KpiCardBase
      label="Retained Clients 💵"
      value={value !== null ? value.toLocaleString() : "--"}
      description="renewed/extended/upgraded their contract with our business"
      infoDescription={
        "Starts from the filtered clients query, then joins client history rows. Counts distinct clients with change_type_code = program-status, value = back-end, and original_value in front-end/back-end. If Date Range is set, history modified_date is filtered within that range."
      }
      infoSql={getRetainedClientsSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
