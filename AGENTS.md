# Agent Handoff Protocol (Codex + Claude Code)

Two coding agents work in this repo. The shared ground truth is the repo itself —
agent-private memory is invisible to the other agent, so anything the next
session needs must land in these files:

| File | Purpose |
| --- | --- |
| `ROADMAP.md` | What shipped, what is `[~]` open and why (reason tags), what is next. |
| `MEMORY.md` | Current operational facts, dirty-work warnings, deploy/env notes, and the latest 1-3 active checkpoints. Keep under 150 lines. |
| `ARCHITECTURE_MAP.md` | Distilled Graphify architecture summary. |

## Start of session

1. Read `MEMORY.md` (newest sections are at the bottom) and skim `ROADMAP.md`
   for `[~]` items in the area you are touching.
2. Check `git status`. Uncommitted work may be **intentional** — before
   committing, reverting, or "cleaning up" anything you did not write, find its
   MEMORY.md entry. If an entry says DO NOT COMMIT, respect it.

## End of session

1. Keep `MEMORY.md` under 150 lines. Add only durable operational facts,
   dirty-work warnings, deploy/env notes, or the latest 1-3 active checkpoints.
   Move older session logs to `MEMORY_ARCHIVE.md` verbatim, append-only. Move
   feature status to `ROADMAP.md`; move detailed runbooks/checklists to
   dedicated docs. Do not delete history; archive it.
2. Update `ROADMAP.md` statuses you affected. Follow its status key: `[~]`
   items must carry reason tags; only Jay's QA promotes `[~]` to `[x]`.
3. Append and promote across the right files. Do not rewrite or delete the
   other agent's history; if an old entry is wrong, add a dated correction.

## Hard rules

- Never commit secrets. `.env`, `.env.*`, and `.env.graphify` are local-only;
  `VITE_BEACON_ANTHROPIC_KEY` currently holds a real key.
- Vercel deploys from `main` — anything pushed there is live. Validated work
  is committed with this repo's git identity (`retainOS`, see MEMORY.md
  "Git / Deploy Workflow").
- Beacon (`/beacon`, `src/lib/beacon/*`) is an uncommitted local pilot — see
  MEMORY.md "Beacon v1 Local Pilot - 2026-06-10" before touching it.
