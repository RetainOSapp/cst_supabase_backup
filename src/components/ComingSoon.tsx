import type { ReactNode } from "react";

export function ComingSoonPanel({
  title,
  description,
  eyebrow = "Coming soon",
  compact = false,
}: {
  title: string;
  description: string;
  eyebrow?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={`overflow-hidden rounded-md border border-[#cbd2dc] bg-white shadow-sm ${
        compact ? "p-5" : "p-8 sm:p-10"
      }`}
    >
      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-[#eaf4fe] text-[#2b79c4]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 6v6l4 2M21 12a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-[#3b8fd9]">
          {eyebrow}
        </div>
        <h2 className="mt-2 text-xl font-semibold text-[#162b3e]">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#586273]">{description}</p>
      </div>
    </section>
  );
}

export function ComingSoonPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#162b3e]">{title}</h1>
        <p className="mt-1 text-sm text-[#586273]">A future RetainOS workspace.</p>
      </div>
      <ComingSoonPanel title={title} description={description} />
    </div>
  );
}

export function ComingSoonModal({
  title,
  description,
  onClose,
}: {
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={`Close ${title}`}
        onClick={onClose}
        className="absolute inset-0 bg-[#0e1b29]/55 backdrop-blur-[2px]"
      />
      <div className="relative w-full max-w-xl rounded-md border border-[#cbd2dc] bg-[#f7f9fc] p-3 shadow-2xl">
        <ComingSoonPanel title={title} description={description} compact />
        <div className="flex justify-end px-2 pb-1 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#162b3e] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1e3a52]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export function ComingSoonTrigger({
  children,
  onClick,
  className,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  className: string;
  title: string;
}) {
  return (
    <button type="button" onClick={onClick} className={className} title={title}>
      {children}
    </button>
  );
}
