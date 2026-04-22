import {
  type DashboardKpiSqlParams,
  getActiveClientsSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface ActiveClientsKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList: () => void;
}

export function ActiveClientsKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: ActiveClientsKpiProps) {
  return (
    <KpiCardBase
      label="Active Clients 🎫"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in front end or back end"
      infoDescription={
        "Counts clients from backup_company_clients after applying company, CSM, secondary assignee, client start date, and date range cutoff filters. Then limits to status values front-end or back-end. If Program is set to a different status, this count becomes 0."
      }
      infoSql={getActiveClientsSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
