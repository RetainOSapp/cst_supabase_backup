import { KpiCardBase } from "./KpiCardBase.tsx";

interface UpForRenewalKpiProps {
  value: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function UpForRenewalKpi({
  value,
  loading,
  onOpenInfo,
  onOpenList,
}: UpForRenewalKpiProps) {
  return (
    <KpiCardBase
      label="Up for Renewal 📆"
      value={value !== null ? value.toLocaleString() : "--"}
      description="active clients up for renewal"
      infoDescription={
        "Shows active Front End and Back End clients whose current renewal date falls inside the selected period. When no date range is selected, this shows overdue renewals plus renewals due in the next 30 days."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
