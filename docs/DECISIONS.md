# Implementation decisions

## Phase 2

- The supplied workspace had no Git repository. Initialized one; the Phase 2 commit includes the existing Phase 1 foundation. No existing migration or application data is replaced.
- Additive migration 2 stores plan context, questions, policy warnings, model provenance, and future reflection results. Phase 1 tests that inserted entire SQL rows now name their columns so additive migrations remain compatible.
- All scheduling and calendar displays use **UTC**, explicitly labeled in the UI. A user's timezone is not guessed.
- Normal planning respects memory. The **guided demo** explicitly supplies sample contacts/dates and injects a labeled 09:00 prep proposal into the first investor run. Policy blocks its approval until corrected; this fixture reconciles the requested intentionally bad first proposal with the seeded 11am rule. It is not represented as a spontaneous model mistake.
- Model transport, response mapping, timeout, repair, fallback, and logging live in one file. Mock calls have zero token counts and a mock model identifier. Live fallback is opt-in and visibly labeled.
- Missing real contact information stays blank in an email draft and is listed as a question. Nothing is sent. Suggested prep dates must be grounded in the user's goal or explicit guided-demo context.

## Phase 3

- The workspace uses Zustand for shared server state, one accent color, system-aware themes, and locally bundled Inter. Pure tool argument schemas are reused by the inline editor so client validation matches server validation.
- Sonner handles accessible error/undo notifications; Base UI is installed for upcoming accessible drawers and confirmation dialogs. Framer Motion fades occasional plan arrivals at 180ms; frequent review actions and keyboard actions remain immediate. Reduced motion and pointer gating are included.
- The smallest Phase 1 extension is `restore(id)`: deletion undo restores the original identity, confidence, counters, and timeline from its recorded snapshot. A new HTTP integration test verifies this.
- During this phase the execution button is explicitly disabled; Phase 4 wires it to local tools. Planning stages are shown as a workflow, not invented server progress percentages.

## Phase 4

- Execution re-checks the deterministic preference policy immediately before each local action, so a preference changed after approval still blocks the action. Each step runs in its own transaction: a failure is recorded on that step and does not roll back other completed local results.
- Only `approved` and `edited` steps run. `executed` and `failed` steps never repeat. A session may run a second batch after more steps are approved.
- Calendar blocks refuse to run when they overlap an existing local event (`CALENDAR_OVERLAP`). Duplicate creation is therefore impossible, and the conflicting block is named in the error.
- Library APIs return the approving step, session, and originating goal so every calendar block, note, and draft can link back to its plan context.
- Search notes is local-only and returns bounded excerpts. No email is sent, no external calendar is touched, and every result is labeled `simulated: true`.

## Phase 5

- Reflection is explicit and user-triggered; nothing is learned silently. It requires at least one reviewed step and locks the session afterward so the evidence cannot change underneath the learned result.
- Reflection output is validated twice: structurally by Zod, then semantically by refines that restrict `evidence_step_ids` to reviewed steps in this session and all memory IDs to the supplied context. Hallucinated IDs are rejected before any write.
- New memories are always `source: "inferred"` with model confidence capped at 0.98. Same-key conflicts weaken the previous value through `upsertMemory`; cross-key contradictions use explicit weakening. Every event carries the session ID and a human-readable reason.
- A memory is never weakened merely because a proposal violated it—only an explicit rejection or contradiction does that.
- The learned diff shows new, reinforced, and weakened memories with before/after confidence. The plan comparator shows v1 and v2 side by side and highlights steps citing changed memories.
- In mock mode, the second demo goal ("Get ready for next week's board meeting.") deterministically shows the learned noon preference and the edited email structure. The learned card offers that next goal in one click.

## Phase 6

- Onboarding is three sentences, not a product tour. It persists a single local flag, can be reopened from help, and never covers the workspace after dismissal. "Start guided demo" seeds context and creates the demo plan in one click.
- Shortcuts act only on the selected step in the Sessions view. They are suppressed while an input, select, or contenteditable has focus and whenever any dialog is open, so typing "a" can never approve something.
- Keys are dispatched as a custom event from the shell; each plan card listens only for its own step ID. This keeps the shortcut logic out of the card's mouse handlers and avoids duplicating keyboard behavior.
- The model activity drawer shows operational metadata only — never prompts, memory contents, or credentials. Mock calls are displayed with the same prominence as live calls, which makes the simulation mode impossible to hide.
- The demo script is a static drawer, not generated content, so the runbook cannot drift from what the seeded fixture actually does. Buttons remount the same seed path the onboarding uses.
- Screens announce planning, execution, and learning through one polite live region instead of dozens of focus moves. Dialogs take initial focus and close on Escape; focus rings are global; reduced-motion rules already disable motion and now cover drawer and onboarding transitions.
- On small screens the breadcrumb is dropped before any action button, and icon buttons grow to 40px targets. Mode badges remain visible at all widths.

## Phase 7

- Export is a single JSON snapshot with `export_version`, every application table, and no credentials or prompts. It is streamed as a browser download rather than a separate report format so users can inspect or migrate it without tooling.
- Forget is not a one-click destructive action. The user must type `FORGET EVERYTHING` exactly, matching the API contract. The reset remains one transaction and clears history too; the UI refreshes every derived view afterward.
- Documentation states plainly what is simulated, what leaves the device in live mode, and what the product does not do. The README leads with the demo rather than an architecture essay.
- The prompt documentation quotes the exact system text and records validation order. Schema repair, semantic refinements, and deterministic policy are described as part of the product contract, not implementation trivia.
- Demo recording guidance lives in `docs/DEMO.md` instead of committing binary screenshots. This keeps the repository reviewable and avoids screenshots drifting from the UI.
- The health endpoint now reports phase 7. Test counts and phase gates stay in `docs/PHASES.md`; the README only states the current suite size.
