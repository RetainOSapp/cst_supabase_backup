import { KpiCardBase } from "./KpiCardBase.tsx";

interface FrontEndClientsKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function FrontEndClientsKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: FrontEndClientsKpiProps) {
  return (
    <KpiCardBase
      label="Front End Clients 🥇"
      value={value !== null ? value.toLocaleString() : "--"}
      description="clients in front end"
      infoDescription={
        "Shows clients currently marked as Front End after the selected dashboard filters are applied. This is the active group that is earlier in the client journey."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
