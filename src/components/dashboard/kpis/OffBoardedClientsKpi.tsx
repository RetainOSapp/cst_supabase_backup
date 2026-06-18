import {
  type DashboardKpiSqlParams,
  getOffBoardedClientsSql,
} from "../../../lib/dashboardKpiSql.ts";
import { KpiCardBase } from "./KpiCardBase.tsx";

interface OffBoardedClientsKpiProps {
  value: number | null;
  loading: boolean;
  sqlParams: DashboardKpiSqlParams;
  onOpenInfo: (title: string, description: string, sql: string) => void;
  onOpenList?: () => void;
}

export function OffBoardedClientsKpi({
  value,
  loading,
  sqlParams,
  onOpenInfo,
  onOpenList,
}: OffBoardedClientsKpiProps) {
  return (
    <KpiCardBase
      label="Off-boarded Clients 📁"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients offboarded"
      infoDescription={
        "Starts from the filtered client query (company, CSM, secondary assignee, selected program, and Client Start Date onboarding window). Then keeps only status off-boarded and filters by the calculated off-boarded date inside the selected Date Range."
      }
      infoSql={getOffBoardedClientsSql(sqlParams)}
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
