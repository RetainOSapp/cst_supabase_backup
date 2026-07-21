import { KpiCardBase } from "./KpiCardBase.tsx";

interface UpForRenewalKpiProps {
  value: number | null;
  totalEndingInPeriod: number | null;
  loading: boolean;
  onOpenInfo: (title: string, description: string) => void;
  onOpenList?: () => void;
}

export function UpForRenewalKpi({
  value,
  totalEndingInPeriod,
  loading,
  onOpenInfo,
  onOpenList,
}: UpForRenewalKpiProps) {
  return (
    <KpiCardBase
      label="Up for Renewal 📆"
      value={
        value !== null
          ? totalEndingInPeriod !== null
            ? `${value.toLocaleString()} / ${totalEndingInPeriod.toLocaleString()}`
            : value.toLocaleString()
          : "--"
      }
      description={
        totalEndingInPeriod !== null
          ? "active clients / contracts ending in period"
          : "active clients up for renewal"
      }
      infoDescription={
        "Shows active Front End and Back End clients whose current renewal date falls inside the selected period. With a reporting date selected, the second number is every contract ending in that period, including clients who are no longer active. When no date range is selected, this shows overdue renewals plus renewals due in the next 30 days."
      }
      onInfoClick={onOpenInfo}
      loading={loading}
      onClick={onOpenList}
    />
  );
}
