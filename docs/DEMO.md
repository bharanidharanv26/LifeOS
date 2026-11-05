# Three-minute demo recording guide

## Before recording

```sh
npm install
npm run check
npm run demo
```

Open `http://localhost:8088`. Click **Reset demo** in the toolbar for a clean, reseeded workspace. Confirm the toolbar says **Demo mode: model and tools are simulated** unless you have verified live mode; live mode instead shows **LIVE MODEL** and must be backed by a **LIVE / OK** row in Model activity. Disable notifications. Record at 1440px wide or larger, browser zoom 100%.

Measured on this repository: a visible plan takes about one second in mock mode, and the complete loop takes under 45 seconds without narration. The 3:00 shot list below leaves room to explain each stage.

Verify the loop in about one minute before recording:

1. Click **Start guided demo**.
2. Click **Reject** on the 09:00 block, choose **too early**, then **Reject & remember why**.
3. Click **Edit** on the email, change the body, then **Save & approve**.
4. Click **Learn from this**.
5. Click **Try the next goal**.
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

Reject with **too early**, then edit the email body and click **Save & approve**.

> “A rejection requires a reason. An edit keeps my structure and becomes evidence too.”

**1:30–2:00 — Learn**

Click **Learn from this**. Point at the new inferred memories, confidence changes, and the session lock.

> “Reflection is explicit, not silent. It learned to avoid morning blocks and copied the email structure I actually wrote. The session is now locked so the evidence cannot change.”

**2:00–2:30 — The same ask changes**

Click **Try the next goal**. Show the comparison.

> “The new plan starts at noon and cites the style I taught it. This is the clearest proof that the loop closed.”

**2:30–3:00 — Proof and privacy**

Click **Approve all safe steps**, then **Run approved (3)**, then show Calendar/Drafts/Notes/Audit. Open **Model activity**.

> “Every action is simulated locally and labeled. Every model call is visible with purpose, latency, and tokens. Export or forget everything from Memory. No cloud copy.”

Close on the plan comparison.

## Optional live-model segment

Only if `MODEL_NAME` is verified:

- Follow [META_SETUP.md](META_SETUP.md): set `MOCK_MODE=false` and credentials in `.env`, then run `npm run model:ping`.
- Restart `npm run demo`.
- Show the **LIVE MODEL** badge and a **LIVE / OK** `ping` row plus a real model name in Model activity.
- Keep the same script; policy and approval still own the outcome.
- If the live call fails, say so. Do not claim fallback results as live.

This repository has **not** verified any live Meta endpoint; the placeholder endpoint and model name must be replaced before recording this segment.

## Verification commands

```powershell
npm run model:ping
Invoke-RestMethod http://127.0.0.1:3001/api/health
(Invoke-RestMethod http://127.0.0.1:3001/api/llm-calls).calls | Select-Object -First 5 purpose, mode, model, latency_ms, ok
(Invoke-RestMethod http://127.0.0.1:3001/api/memories).memories | Format-Table key, confidence, source
Invoke-RestMethod http://127.0.0.1:3001/api/export -OutFile lifeos-export.json
```

Expected: `model:ping` exits 0 and states that no endpoint was contacted in mock mode; `phase: 8`; `retrieval: "keyword"` unless embeddings are explicitly enabled; five demo memories after seeding; and model calls labeled `mock` in offline mode. The export contains memories, sessions, plans, steps, drafts, notes, calendar events, audit entries, and model-call metadata.

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
