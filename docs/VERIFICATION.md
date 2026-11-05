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
