# Three-minute demo recording guide

## Before recording

```sh
npm install
npm run check
npm run demo
```

Open `http://localhost:5173`. Use a clean workspace or click **Forget everything** in Memory first. Confirm the badge says **MOCK · SIMULATED** unless you have verified a live model. Disable notifications. Record at 1440px wide or larger, browser zoom 100%.

Verify the loop in about one minute before recording:

1. Start the guided demo.
2. Reject the 09:00 block with “too early”.
3. Edit the email body and save.
4. Learn from this.
5. Open the board-meeting next goal.
6. Confirm the new plan cites noon and the edited style.

## Shot list

**0:00–0:15 — Frame the problem**

Show the empty workspace and the three-panel layout.

> “Most assistants forget you between sessions. LifeOS remembers how you work, plans with that context, asks before acting, and learns from your decisions.”

**0:15–0:35 — Start the loop**

Click **Start guided demo**. Point at the goal, the summary, and the cited memories.

> “This is a fictional investor call. The plan remembers my prep duration, my Thursday update habit, and that I protect Friday afternoons.”

**0:35–1:00 — The conflict is visible**

Scroll to the 09:00 prep block and its blocking warning.

> “The plan staged an early block on purpose. My stored rule says no meetings before 11, and the policy checker blocks approval. The model never gets to overrule my preference.”

**1:00–1:30 — Reject and edit**

Reject with “too early”. Then edit the email body and save.

> “A rejection requires a reason. An edit keeps my structure and becomes evidence too.”

**1:30–2:00 — Learn**

Click **Learn from this**. Point at the new inferred memories, confidence changes, and the session lock.

> “Reflection is explicit, not silent. It learned to avoid morning blocks and copied the email structure I actually wrote. The session is now locked so the evidence cannot change.”

**2:00–2:30 — The same ask changes**

Click the next board-meeting goal. Show the comparison.

> “The new plan starts at noon and cites the style I taught it. This is the clearest proof that the loop closed.”

**2:30–3:00 — Proof and privacy**

Approve safe steps, run them, then show Calendar/Drafts/Notes/Audit. Open **Model activity**.

> “Every action is simulated locally and labeled. Every model call is visible with purpose, latency, and tokens. Export or forget everything from Memory. No cloud copy.”

Close on the plan comparison.

## Optional live-model segment

Only if `MODEL_NAME` is verified:

- Set `MOCK_MODE=false` and credentials in `.env`.
- Restart `npm run demo`.
- Show the **LIVE MODEL** badge and a real model name in Model activity.
- Keep the same script; policy and approval still own the outcome.
- If the live call fails, say so. Do not claim fallback results as live.

## Verification commands

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
(Invoke-RestMethod http://127.0.0.1:3001/api/llm-calls).calls | Select-Object -First 5 purpose, mode, model, latency_ms, ok
(Invoke-RestMethod http://127.0.0.1:3001/api/memories).memories | Format-Table key, confidence, source
Invoke-RestMethod http://127.0.0.1:3001/api/export -OutFile lifeos-export.json
```

Expected: `phase: 7`, five demo memories after seeding, and model calls labeled `mock` in offline mode. The export contains memories, sessions, plans, steps, drafts, notes, calendar events, audit entries, and model-call metadata.

## Submission form answers

- **What did you build?** A local-first personal work agent that closes a visible learning loop: recall, plan, approve, act, reflect.
- **Why this track?** “Build for Your World” needs software that adapts to one person's context, not another generic chat surface.
- **What is novel?** Approval-gated learning with evidence: every inferred preference traces to a reviewed step, and the next plan visibly changes.
- **What is simulated?** Email, calendar, and notes are local SQLite actions. No external side effects.
- **How is Meta used?** One provider-agnostic adapter calls a Meta-compatible chat-completions endpoint with structured outputs; deterministic code enforces policy and writes memory.
- **What is next?** Real connectors, on-device embeddings, encrypted backups, multi-session learning summaries.

## Known limitations to state honestly

- Single-user local app; no authentication.
- No streaming; planning uses staged progress.
- Keyword retrieval only; no embedding dependency.
- Reflection is session-scoped and user-triggered.
- Live-model behavior depends on the exact provider's JSON-mode support and usage metadata.
