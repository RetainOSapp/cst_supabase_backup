import { type KeyboardEvent as ReactKeyboardEvent } from "react";

interface KpiCardBaseProps {
  label: string;
  value: string | number;
  description?: string;
  /** When true, the description line shows a loading placeholder instead of text */
  descriptionLoading?: boolean;
  infoDescription: string;
  onInfoClick: (title: string, description: string) => void;
  loading?: boolean;
  onClick?: () => void;
}

export function KpiCardBase({
  label,
  value,
  description,
  descriptionLoading,
  infoDescription,
  onInfoClick,
  loading,
  onClick,
}: KpiCardBaseProps) {
  const handleInfoClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onInfoClick(label, infoDescription);
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!onClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  };

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 text-xs font-medium text-gray-500 uppercase tracking-wider truncate">
          {label}
        </div>
        <button
          type="button"
          onClick={handleInfoClick}
          aria-label={`How ${label} is calculated`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-200 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors cursor-pointer"
        >
          i
        </button>
      </div>
      <div className="mt-2 text-3xl font-semibold text-gray-900 tabular-nums">
        {loading ? (
          <span className="inline-block h-8 w-20 rounded bg-gray-100 animate-pulse" />
        ) : (
          value
        )}
      </div>
      {descriptionLoading ? (
        <div className="mt-1">
          <span className="inline-block h-4 w-44 max-w-full rounded bg-gray-100 animate-pulse" />
        </div>
      ) : description ? (
        <div className="mt-1 text-sm text-gray-500">{description}</div>
      ) : null}
    </>
  );

  if (!onClick) {
    return <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">{content}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 text-left transition-all hover:border-indigo-300 hover:shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
    >
      {content}
    </div>
  );
}
