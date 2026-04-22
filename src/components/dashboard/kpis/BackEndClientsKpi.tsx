import {
  type DashboardKpiSqlParams,
  getBackEndClientsSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface BackEndClientsKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList: () => void;
}

export function BackEndClientsKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: BackEndClientsKpiProps) {
  return (
    <KpiCardBase
      label="Back End Clients 🥈"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in back end"
      infoDescription={
        "Counts clients from backup_company_clients after applying company, CSM, secondary assignee, client start date, and date range cutoff filters. Then limits to status value back-end."
      }
      infoSql={getBackEndClientsSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
