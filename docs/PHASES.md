# LifeOS phase gates

Phases 1–7 are implemented. Every phase passes `npm run check` before the next begins.

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

Expected: every check passes; `http://localhost:8088` shows a connected database and five demo memories; `http://127.0.0.1:3001/api/health` returns `status: "ok"`, `phase: 1`, and `mockMode: true` by default.

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

**Complete. Gate: `npm run check` passed; 45 tests.** `npm run demo` remains runnable.

- [x] Sidebar, command bar, themes, and three-pane layout.
- [x] Plan cards with approve/edit/reject and memory citations.
- [x] Memory management panel and timelines.
- [x] Deletion undo restores the original memory snapshot through `POST /api/memories/:id/restore`.

## Phase 4 — Local tools

**Complete. Gate: `npm run check` passed; 49 tests.** Commit follows this phase gate.

- [x] Validated tool arguments, previews, and approval-gated execution.
- [x] `POST /api/sessions/:id/execute` runs only approved/edited steps.
- [x] Local drafts, overlap-aware calendar blocks, notes, and note search.
- [x] Calendar/notes/drafts views and a filterable audit timeline.
- [x] Policy is re-checked immediately before execution; failures are recorded per step.
- [x] Every local result links back to its approving step and session.

## Phase 5 — Learning demo

**Complete. Gate: `npm run check` passed; 52 tests.** `npm run demo` remains runnable.

- [x] Reflection from approvals, before/after edits, and reasoned rejections.
- [x] Learned diff and memory changes tied to the session (`POST /api/sessions/:id/reflect`).
- [x] Changed-since-last-time summaries and side-by-side run comparison.
- [x] Full seed → plan → reject/edit → reflect → changed-plan test in mock mode.
- [x] New memories animate into the learned card; the demo offers the next goal in one click.

## Phase 6 — Interaction polish

**Complete. Gate: `npm run check` passed; 52 tests.**

- [x] Three-step onboarding on first run, reopenable from the help button. It never blocks the workspace and can start the guided demo directly.
- [x] Keyboard shortcuts on the selected step: `A` approve, `E` edit, `R` reject. They are ignored while typing, in dialogs, and outside Sessions.
- [x] Model activity drawer fed by `GET /api/llm-calls`: purpose, mode, model, latency, tokens, retries, outcome, and timestamp. Prompts and keys are never exposed.
- [x] Demo-script drawer with the exact two-minute sequence plus one-click "Load demo data" and "Start guided demo".
- [x] Accessibility pass: live region for planning/execution/learning state, shortcut hints, labeled dialogs with Escape close and initial focus, visible focus rings, reduced motion.
- [x] Responsive topbar and drawers down to 360px; no hover-only affordances.

## Phase 7 — Release readiness

**Complete. Gate: `npm run check` passed; 53 tests.**

- [x] `GET /api/export` downloads every user table as JSON; the Memory view offers Export JSON.
- [x] In-app **Forget everything** requires typing `FORGET EVERYTHING`, calls the existing reset endpoint, and refreshes the workspace.
- [x] README rewritten for a final submission: pitch, quick start, exact demo script, architecture diagram, API, environment, privacy, real-vs-mock, limitations.
- [x] `docs/ARCHITECTURE.md` and `docs/PROMPTS.md` document the lifecycle, memory math, policy engine, model contracts, retries, and mock behavior.
- [x] `.env.example` reflects live-model configuration and the single `mapProviderProtocol` adaptation point.
- [x] `docs/DEMO.md` records the three-minute recording shot list and verification commands.

## Phase 8 — Optional

**Hybrid retrieval complete. Gate: `npm run check` passed; 58 tests.** Streaming responses were deliberately not added; the existing staged planning indicator is honest and the model adapter is non-streaming.

- [x] Opt-in hybrid retrieval through an OpenAI-compatible `POST /embeddings` endpoint (`EMBEDDINGS_ENABLED`).
- [x] Vectors cached by memory content hash in migration 3 with cascade delete; only new or changed text is embedded.
- [x] Blend weight configurable; keyword ranking remains the default and the automatic fallback on any embedding failure.
- [x] Health reports `retrieval: "keyword" | "hybrid"` and whether the endpoint is actually configured.
- [x] Tests cover semantic-only ranking, caching, keyword fallback, configuration defaults, and cosine math.
- [ ] Streaming progress and further demo-script refinement: intentionally out of scope for this pass.
