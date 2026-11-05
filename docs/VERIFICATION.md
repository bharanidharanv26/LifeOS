# Demo verification log

## Step 1

- `npm run check`: exit 0; 58 backend tests passed.
- `npm run demo`: started both workspaces on Windows. Client HTTP 200 on `http://localhost:8088`; proxied health reports mock mode, fallback disabled.
- Direct API CORS responses allow both requested origins.
- Windows reported an occupied socket without a usable `State` value. Port cleanup now uses a bind probe and local-port/remote-port-zero ownership instead of relying on that field.

## Browser issues found and fixed

| Before                                                                                                                   | After                                                                                                    | Why                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Sticky approval footer obscured plan previews and controls.                                                              | Footer stays in document flow.                                                                           | Every review control remains reachable and visible. |
| Starting a plan at tablet width left the viewport below the policy warning; learning left the result above the viewport. | New plans and reflection results scroll their heading into view; navigation resets scroll.               | Keep the relevant result on camera.                 |
| Contradicted email-style memory dropped from 90% to 65%, but reflection omitted it from the before/after payload.        | Reflection computes the actual confidence diff after all updates; regression assertion covers 90% → 65%. | Show learning accurately without weakening twice.   |
| Learned card showed only the replacement email style.                                                                    | Explicit Before/After text plus confidence change.                                                       | Explain what changed.                               |
| Comparison titles and status badges competed for narrow columns.                                                         | Comparison rows wrap.                                                                                    | Preserve legibility at 1280px and tablet width.     |
| Muted light-theme text had marginal contrast; dark user audit badges used a dark fixed purple.                           | Darker light-theme muted token; theme-aware audit color.                                                 | Improve readability.                                |
| Audit JSON was permanently truncated, hiding rejection evidence.                                                         | Concise summaries and expandable full details.                                                           | Decisions can be inspected in the UI.               |
| Tablet calendar clipped weekend columns and abbreviated event titles.                                                    | Seven fitting columns at tablet width, wrapping titles; two columns on smaller screens.                  | All days and complete labels are accessible.        |
| Notes were labeled only “Local”; drafts briefly showed an empty state while loading.                                     | Notes explicitly say simulated; drafts have a loading state.                                             | Honest tool labels and accurate state feedback.     |

The Chromium test runs the complete reject → edit → learn → compare → approve → execute flow at 1440×900, 1280×900, and 768×900. It fails on console errors, uncaught page errors, failed requests, HTTP errors, or horizontal document overflow. Screenshots include a dark-theme view. Screenshot inspection is performed by opening the generated PNGs, not inferred from passing assertions.

Live Meta connectivity and model quality have not been verified.

## Step 3

- Reset demo now atomically clears application rows and restores five seed memories. The browser suite checks empty sessions, plans, results and model calls, original confidence values, and a second run returning to v1 with the blocking warning.
- Superseded same-key memories use a dimmed surface and explicit label; stronger evidence sorts ahead of the older value. Memory order is stable across resets.
- Empty workspace explains Remember → Plan → Ask → Act → Learn. The persistent toolbar states “Demo mode: model and tools are simulated”.
- All three progress labels are shown during a bounded 650ms mock reading window. Complete click-to-plan time is asserted below three seconds.
- Keyboard browser test covers blocked A, R with focused reason input, E with focused body editor, typing without firing shortcuts, A approval, and locked-session shortcuts.
- Onboarding and drawers previously allowed focus to escape. They now trap Tab/Shift+Tab, close on Escape, make the background inert, and restore focus. Browser checks include a visible 2px focus outline, the polite notification live region, updated workspace status, and reduced-motion mode. Actual spoken screen-reader output is not verified.
- One visible toast at a time avoids notification stacks; tablet empty-state spacing keeps the start button above reset feedback.

## Step 4

- `npm run model:ping` (mock mode, fallback off): exit 0; prints `OK`, model `mock/lifeos-v1`, mode `mock`, elapsed time, zero tokens, and an explicit statement that no endpoint was contacted.
- The ping path uses the production `createLlmClient` and `mapProviderProtocol` with one attempt, an eight-output-token cap, and a persisted `llm_calls` row. It prints live mode as `live` and treats a simulated fallback or blank output as failure.
- Failure output includes the redacted raw response body, HTTP status, and elapsed time, exits nonzero, and reports a missing response body on transport failures. Unit tests cover HTTP 401/503, malformed success, timeout, token reporting, the request cap, mock labeling, and fallback honesty; configured credentials and common secret fields are asserted absent.
- `docs/META_SETUP.md` documents both `.env` locations, all model variables, the single protocol adaptation point, the ping command, the LIVE evidence required in Model activity, and records that live Meta connectivity is still **not verified**.
- A local HTTP stub (not Meta) exercised the real CLI process: HTTP 401 exited nonzero, printed the provider error code, printed the raw body with the bearer credential and echoed token replaced by `[REDACTED]`; an OpenAI-shaped success returned `OK`, `mode: live`, and 7 provider-reported tokens. The outgoing request carried the configured model name and an eight-token cap, and the database row was written to a temporary file.
- `npm run check`: exit 0; 65 backend tests passed (7 new).

## Step 5

- README now states exactly what was verified and what was not, embeds the workspace/reflection/comparison screenshots, uses the three-minute timing, and points live-model readers to `docs/META_SETUP.md` and `npm run model:ping`.
- `docs/DEMO.md` matches the labels in the app and the browser suite: **Reset demo**, **Start guided demo**, reason **too early**, **Reject & remember why**, **Save & approve**, **Learn from this**, **Try the next goal**, **Approve all safe steps**, **Run approved (3)**. Measured mock click-to-plan is about one second and the full loop is under 45 seconds without narration.
- Secret audit: `.env` was never committed; only `.env.example` is tracked and its credential values are empty. No tracked database, SQLite, PEM, or key files. A history-wide search found no API-key, private-key, GitHub, AWS, or Meta token patterns, and the working tree has no non-empty secret assignments outside tests and docs.
- Stale documentation corrected: the phase log no longer says two minutes, and the decision log now explains that generated screenshots are committed and must be regenerated after UI changes.

## Step 6

- Clean install: `npm ci` installed 442 packages with zero vulnerabilities. npm printed an informational allowScripts warning; a direct `better-sqlite3` in-memory query succeeded, so the native module was usable.
- `npm run check` after the clean install: exit 0; 65 backend tests, strict typecheck, lint, formatting, and both production builds passed.
- `npm run e2e`: 4/4 passed in 40.7 seconds. Click-to-plan was 1098ms, 1018ms, and 1023ms at 1440/1280/768px, all below the 3s assertion. The keyboard/focus/live-region/reduced-motion test also passed.
- `npm run demo`: client returned HTTP 200 at `http://localhost:8088` with the LifeOS title; health reported `status: ok`, `phase: 8`, `database: connected`, `mockMode: true`, `mockFallback: false`, `retrieval: keyword`, and five seeded memories. Both ports were rebindable after shutdown. Windows retained phantom PID-0 LISTENING rows after the process tree was killed, but a bind probe confirmed the ports are free; this is the same Windows quirk addressed in Step 1.
- Screenshots were regenerated by the browser suite. Five changed (`02-plan-with-warning-1280`, `05-v1-vs-v2-768`, `07-audit`, `08-model-activity`, `09-dark-theme`) and were opened and inspected: toasts reflect the current run, the 768px comparison fits without page overflow, and the dark audit view keeps readable contrast. They are committed as the current artifacts.
- Still unverified: any live Meta endpoint, credential, or model identifier; actual spoken screen-reader output; browsers other than Chromium.
