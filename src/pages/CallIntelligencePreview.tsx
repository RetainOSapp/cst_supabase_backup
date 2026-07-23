import { useState, type ReactNode } from "react";
import { CallIntelligenceDemo } from "../components/call-ai/CallIntelligenceDemo.tsx";

function Mark() {
  return (
    <span className="flex items-center gap-2.5">
      <svg width="29" height="29" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20.5 8.5A9 9 0 1 0 21 13" stroke="#59ABF0" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M20.8 3.6 21.4 9 16 8.2z" fill="#59ABF0" />
      </svg>
      <span className="text-xl font-bold text-white">RetainOS</span>
    </span>
  );
}

function NavIcon({ children }: { children: ReactNode }) {
  return <span className="grid h-5 w-5 place-items-center text-base">{children}</span>;
}

const NAV_ITEMS = [
  { label: "Dashboard", icon: "▦" },
  { label: "Daily Pulse", icon: "⌁" },
  { label: "Clients", icon: "♙" },
  { label: "CSM Reports", icon: "▥" },
  { label: "Tasks", icon: "✓" },
  { label: "Pipeline", icon: "◇" },
  { label: "Call AI", icon: "⌕", active: true },
  { label: "Groups", icon: "♧" },
  { label: "Resources", icon: "▤" },
  { label: "Admin Hub", icon: "⚙" },
  { label: "SaaS Clients", icon: "♙" },
];

function ReconciliationPreview({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#2b79c4]">Operations</p>
          <span className="rounded-full border border-[#b9dcf8] bg-[#eaf4fe] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#2b79c4]">
            Product preview · Sample data
          </span>
        </div>
        <h1 className="mt-2 text-3xl font-bold text-[#162b3e]">Call AI</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#667085]">
          Resolve calls that could not be matched automatically before they enter the intelligence workflow.
        </p>
      </div>
      <div className="border-b border-[#dfe5ec]">
        <nav className="-mb-px flex gap-6">
          <button type="button" onClick={onBack} className="border-b-2 border-transparent px-1 pb-3 text-sm font-semibold text-[#667085] hover:text-[#162b3e]">
            Call Intelligence
          </button>
          <button type="button" className="border-b-2 border-[#59abf0] px-1 pb-3 text-sm font-bold text-[#162b3e]">
            Reconciliation
          </button>
        </nav>
      </div>
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Unmatched", "0", "text-amber-700"],
          ["Ambiguous", "0", "text-orange-700"],
          ["Failed", "0", "text-red-700"],
        ].map(([label, value, colorClass]) => (
          <article key={label} className="rounded-xl border border-[#e4e9f0] bg-white p-5 shadow-sm">
            <p className={`text-[10px] font-bold uppercase tracking-[0.08em] ${colorClass}`}>{label}</p>
            <p className="mt-2 text-3xl font-bold text-[#162b3e]">{value}</p>
          </article>
        ))}
      </section>
      <section className="rounded-xl border border-[#e4e9f0] bg-white px-6 py-14 text-center shadow-sm">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-xl text-emerald-600">✓</span>
        <h2 className="mt-4 text-base font-bold text-[#162b3e]">Everything is matched</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#667085]">
          New Fathom calls will appear here only when RetainOS needs a human to confirm the correct client or team member.
        </p>
      </section>
    </div>
  );
}

export function CallIntelligencePreview() {
  const [section, setSection] = useState<"intelligence" | "reconciliation">("intelligence");

  return (
    <div className="min-h-screen bg-[#f7f9fc] lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="hidden h-screen flex-col bg-[#162b3e] text-[#e8eef5] lg:sticky lg:top-0 lg:flex">
        <div className="px-5 pb-5 pt-5"><Mark /></div>
        <div className="mx-3 mb-3 rounded-lg bg-white/5 px-3 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8fa3b8]">Viewing company</p>
          <div className="mt-2 flex items-center justify-between rounded-md border border-white/10 bg-[#1e3a52] px-3 py-2 text-xs font-semibold text-white">
            Ethical Scaling
            <span className="text-[#8fa3b8]">⌄</span>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold ${
                item.active ? "bg-[#59abf0] text-[#162b3e]" : "text-[#b7c5d4]"
              }`}
            >
              <NavIcon>{item.icon}</NavIcon>
              {item.label}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/8 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#2b4d6a] text-xs font-bold text-white">JA</div>
            <div>
              <p className="text-xs font-semibold text-white">Jay</p>
              <p className="mt-0.5 text-[10px] text-[#8fa3b8]">Super Admin</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-[#e4e9f0] bg-white px-4 sm:px-6 lg:px-7">
          <div className="lg:hidden">
            <span className="flex items-center gap-2">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20.5 8.5A9 9 0 1 0 21 13" stroke="#59ABF0" strokeWidth="2.6" strokeLinecap="round" />
                <path d="M20.8 3.6 21.4 9 16 8.2z" fill="#59ABF0" />
              </svg>
              <span className="font-bold text-[#162b3e]">RetainOS</span>
            </span>
          </div>
          <p className="hidden text-sm font-semibold text-[#162b3e] lg:block">Welcome back, Jay</p>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-[#d6eafb] bg-[#eaf4fe] px-3 py-1.5 text-xs font-semibold text-[#2b79c4] sm:flex">
              <span className="h-2 w-2 rounded-full bg-[#34b389]" />
              View as active
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#162b3e] text-[11px] font-bold text-white lg:hidden">JA</span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
          {section === "intelligence" ? (
            <CallIntelligenceDemo onShowReconciliation={() => setSection("reconciliation")} />
          ) : (
            <ReconciliationPreview onBack={() => setSection("intelligence")} />
          )}
        </main>
      </div>
    </div>
  );
}
