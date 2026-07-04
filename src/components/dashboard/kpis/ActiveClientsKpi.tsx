import { KpiCardBase } from "./KpiCardBase.tsx";

interface ActiveClientsKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function ActiveClientsKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: ActiveClientsKpiProps) {
  return (
    <KpiCardBase
      label="Active Clients 🎫"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in front end or back end"
      infoDescription={
        "Shows clients currently marked as Front End or Back End after the selected dashboard filters are applied. Company, CSM, secondary assignee, pathway, program, client start date, and date range filters can all affect this number."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
