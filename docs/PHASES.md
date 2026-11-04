# LifeOS phase gates

Phases 1–2 are implemented. Every phase passes `npm run check` before the next begins.

## Phase 1 — Foundation

- [x] npm workspaces: React 18/Vite client and Node/Express/TypeScript server.
- [x] Strict TypeScript, ESLint, Prettier, and root development/test/demo scripts.
- [x] Complete SQLite schema, transactional migrations, constraints, indexes, WAL, and shutdown handling.
- [x] Memory creation, upsert, edit, archive, delete, and retained event history.
- [x] Keyword/BM25-style retrieval, confidence/recency weighting, retrieval explanations, and use events.
- [x] Contradiction handling, confidence caps, auto-archive, and idle decay.
- [x] Idempotent five-memory demo seed and confirmed full reset.
- [x] Health and memory APIs with Zod validation, security middleware, and consistent errors.
- [x] Read-only client status screen with working demo-data button.
- [x] Backend unit and API integration tests.

Acceptance commands from the repository root:

```sh
npm install
npm run check
npm run demo
```

Expected: every check passes; `http://localhost:5173` shows a connected database and five demo memories; `http://127.0.0.1:3001/api/health` returns `status: "ok"`, `phase: 1`, and `mockMode: true` by default.

`npm run seed` is safe to repeat. The second run should report **0 added, 5 already present, 5 active memories**.

## Phase 2 — Model adapter and planning

**Complete. Gate: `npm run check` passed; 44 tests.** `npm run demo` remains runnable. The planning and review APIs are available; the approval workspace follows in Phase 3.

- Single configurable Meta-compatible model adapter; request/response mapping isolated.
- Deterministic, memory-aware offline mocks.
- Structured output validation with two repair retries and model-call logging.
- Understand → retrieve → plan → deterministic policy check → persist proposal.
- Reconcile the deliberately early demo step by surfacing a policy conflict; never silently treat it as safe.
- Tests for output repair and policy enforcement.

## Phase 3 — Approval workspace

- Sidebar, command bar, themes, and three-pane layout.
- Plan cards with approve/edit/reject and memory citations.
- Memory management panel and timelines.

## Phase 4 — Local tools

- Validated tool arguments, previews, and approval-gated execution.
- Local drafts, overlap-aware calendar blocks, notes, and search.
- Calendar/notes/drafts views and filterable audit timeline.

## Phase 5 — Learning demo

- Reflection from approvals, before/after edits, and reasoned rejections.
- Learned diff and memory changes tied to the session.
- Changed-since-last-time summaries and side-by-side run comparison.
- Full seed → plan → reject/edit → reflect → changed-plan test in mock mode.

## Phase 6 — Interaction polish

- Motion, empty states, review shortcuts, accessibility, and onboarding.
- Model activity drawer and progress stages.
- Demo-script helper panel.

## Phase 7 — Release readiness

- End-to-end checks, expanded README, screenshots/GIF, architecture and prompt documentation.
- JSON export and confirmed in-app forget control.
- Document exact Meta model configuration and the real-versus-mock contract.

## Phase 8 — Optional

- Embedding-based hybrid retrieval, streaming responses, and demo-script refinements.
