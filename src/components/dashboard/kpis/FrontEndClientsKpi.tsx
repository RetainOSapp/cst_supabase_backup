import {
  type DashboardKpiSqlParams,
  getFrontEndClientsSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface FrontEndClientsKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList?: () => void;
}

export function FrontEndClientsKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: FrontEndClientsKpiProps) {
  return (
    <KpiCardBase
      label="Front End Clients 🥇"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in front end"
      infoDescription={
        "Counts clients from backup_company_clients after applying company, CSM, secondary assignee, client start date, and date range cutoff filters. Then limits to status value front-end."
      }
      infoSql={getFrontEndClientsSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
