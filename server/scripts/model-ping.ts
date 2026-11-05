import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, type Config } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/index.js';
import { createLlmClient } from '../src/llm/client.js';

export function redactSecrets(text: string, config: Config): string {
  let safe = text;
  const url = new URL(config.modelBaseUrl);
  for (const secret of [config.modelApiKey, config.embeddingsApiKey, url.username, url.password]) {
    if (!secret) continue;
    for (const representation of new Set([
      secret,
      encodeURIComponent(secret),
      JSON.stringify(secret).slice(1, -1),
    ])) {
      safe = safe.split(representation).join('[REDACTED]');
    }
  }
  return safe
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, '$1[REDACTED]')
    .replace(
      /("(?:api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|authorization|x-api-key)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"',
    );
}

/** CLI diagnostic: errors stay in the terminal, never in API responses or SQLite. */
export async function runModelPing(
  config: Config,
  fetchImpl: typeof fetch = fetch,
  write: (message: string) => void = console.info,
): Promise<0 | 1> {
  const started = performance.now();
  const db = openDatabase(config.databasePath);
  let rawBody = '';
  let status: number | undefined;
  const transport: typeof fetch = async (input, init) => {
    const response = await fetchImpl(input, init);
    status = response.status;
    rawBody = await response.clone().text();
    return response;
  };
  const model = config.mockMode ? 'mock/lifeos-v1' : config.modelName;
  const output = (ok: boolean, mode: string, tokens: string, error?: string) => {
    write(
      redactSecrets(
        [
          `${ok ? 'OK' : 'FAIL'} | model: ${model} | mode: ${mode}`,
          `latency: ${Math.round(performance.now() - started)} ms | tokens: ${tokens}`,
          ...(error
            ? [
                `error: ${error}`,
                `HTTP: ${status ?? 'no response'}`,
                `raw error body (secrets redacted):\n${rawBody || '(no response body received)'}`,
              ]
            : []),
          ...(config.mockMode
            ? [
                'SIMULATED: no model endpoint was contacted. Set MOCK_MODE=false to test the live connection.',
              ]
            : []),
        ].join('\n'),
        config,
      ),
    );
  };
  try {
    const result = await createLlmClient(db, config, transport).chat({
      purpose: 'ping',
      system: 'Reply with OK.',
      messages: [{ role: 'user', content: '{}' }],
      temperature: 0,
      maxTokens: 8,
      maxAttempts: 1,
    });
    if (result.fallback || !result.text.trim()) {
      output(
        false,
        result.mode,
        'unavailable',
        result.fallback
          ? 'Live connection failed; fallback is simulated.'
          : 'Empty model response.',
      );
      return 1;
    }
    output(
      true,
      result.mode,
      `${result.usage.promptTokens + result.usage.completionTokens} (${result.usage.promptTokens} prompt + ${result.usage.completionTokens} completion; zero when unreported or simulated)`,
    );
    return 0;
  } catch (error) {
    output(
      false,
      config.mockMode ? 'mock' : 'live',
      'unavailable',
      error instanceof Error ? error.message : 'Unknown model error',
    );
    return 1;
  } finally {
    closeDatabase(db);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    process.exitCode = await runModelPing(loadConfig());
  } catch {
    console.error(
      'FAIL | model: unavailable | latency: unavailable | tokens: unavailable\nCould not load configuration or open the database. Check .env and DATABASE_PATH.',
    );
    process.exitCode = 1;
  }
}
