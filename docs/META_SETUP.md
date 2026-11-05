# Connecting a live Meta model

**Current verified build: MOCK. No live Meta endpoint, credential, or model identifier has been validated.** The default endpoint and model name are placeholders. Obtain the exact endpoint, model ID and credential from the Meta/provider documentation and your account access before changing modes.

## Checklist

1. Put server configuration in **`D:\meta_hack\.env`**, beside the root `package.json`. If missing, copy `.env.example`. Never use `client/.env`, `VITE_*` variables or committed files for credentials.
2. Configure:

   | Variable             | What to enter                                                                                                          |
   | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | `MODEL_BASE_URL`     | Provider's base URL. Current mapping appends `/chat/completions`.                                                      |
   | `MODEL_API_KEY`      | Your server-only credential.                                                                                           |
   | `MODEL_NAME`         | Exact available Meta model identifier.                                                                                 |
   | `MODEL_AUTH_HEADER`  | Usually `Authorization`; use the documented header.                                                                    |
   | `MODEL_AUTH_PREFIX`  | Usually `Bearer`; leave empty for a raw key header.                                                                    |
   | `MODEL_JSON_MODE`    | `true` if JSON-object response mode is supported.                                                                      |
   | `MODEL_TIMEOUT_MS`   | Per-request timeout; default `8000`.                                                                                   |
   | `MOCK_MODE`          | `false` to contact the endpoint.                                                                                       |
   | `MOCK_FALLBACK`      | Keep `false` to expose failures clearly.                                                                               |
   | `EMBEDDINGS_ENABLED` | Keep `false` for the core demo. Optional embedding endpoint/key/model/timeout/weight are documented in `.env.example`. |
   | `DATABASE_PATH`      | Default `server/data/lifeos.db`; the ping records model-call metadata here.                                            |

   Keep `HOST=127.0.0.1`, `PORT=3001`, and both 8088 origins in `CLIENT_ORIGIN`. The browser calls the Vite `/api` proxy; the client never receives the model key. Shell environment variables take precedence over `.env`.

3. For a provider with a different wire format, **only `mapProviderProtocol` in `server/src/llm/client.ts` needs adapting**: URL, authentication, request JSON, output-token limit and response decoding. The current implementation expects an OpenAI-compatible chat-completions envelope. Do not assume this is Meta's direct API contract. Agent prompts and tool validation remain behind that boundary.
4. From the repository root, run:

   ```sh
   npm run model:ping
   ```

   It makes **one** request through the shared client, requests at most eight output tokens, and prints OK/FAIL, mode, model name, elapsed milliseconds and tokens. Zero token counts mean simulated or unreported usage. Failures exit nonzero and print the raw response body with configured credentials and common secret fields redacted. Network failures explicitly report no response body. No raw body is stored in SQLite or returned to the browser.

   If `.env` still has `MOCK_MODE=true`, **OK means the mock adapter worked**, and the script explicitly says no endpoint was contacted. An enabled simulated fallback still yields **FAIL** for a live ping.

5. Restart with `npm run demo`. The toolbar should read **LIVE MODEL**. Open **Model activity** (pulse icon), then **Refresh**: the `ping` row must say **LIVE**, show the configured model name and **OK**. The toolbar alone only describes configuration; the successful LIVE row is the connection evidence.
6. Create a goal and inspect the `understand` and `plan` rows; review a step and click **Learn from this** for `reflect`. Confirm valid structured output, citations, policy blocking and the next-plan behavior end to end. A successful ping alone does not verify these contracts. The guided 09:00 conflict remains a labeled fixture even with a live model.
7. Record the exact provider/model, date, observed latency, usage and limitations here before claiming live Meta use:

   **Live verification: [NOT YET RUN — add provider, model ID, date and observed results].**

For another offline recording, set `MOCK_MODE=true`, `MOCK_FALLBACK=false`, `EMBEDDINGS_ENABLED=false`, restart, and click **Reset demo**. Email, calendar and notes are local simulations in either model mode.
