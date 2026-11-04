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
  +- Only `approved` and `edited` steps run. `executed` and `failed` steps never repeat. A session may run a second batch after more steps are approved.
  +- Calendar blocks refuse to run when they overlap an existing local event (`CALENDAR_OVERLAP`). Duplicate creation is therefore impossible, and the conflicting block is named in the error.
  +- Library APIs return the approving step, session, and originating goal so every calendar block, note, and draft can link back to its plan context.
  +- Search notes is local-only and returns bounded excerpts. No email is sent, no external calendar is touched, and every result is labeled `simulated: true`.
