import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { loadConfig, type Config } from '../config.js';
import { closeDatabase, openDatabase, type LifeDatabase } from '../db/index.js';
import { AppError } from '../errors.js';
import { mockOutput } from './mock.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
export interface ChatInput<T = unknown> {
  system: string;
  messages: ChatMessage[];
  jsonSchema?: z.ZodType<T>;
  temperature?: number;
  purpose?: string;
  maxAttempts?: 1 | 2 | 3;
  maxTokens?: number;
}
export interface ChatResult<T = unknown> {
  text: string;
  json?: T;
  usage: { promptTokens: number; completionTokens: number };
  latencyMs: number;
  mode: 'mock' | 'live' | 'fallback';
  fallback: boolean;
}

/** TODO(META): adapt ONLY this function after confirming Meta's request/response contract. */
export function mapProviderProtocol(config: Config, input: ChatInput, messages: ChatMessage[]) {
  const responseSchema = z.object({
    choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
    usage: z
      .object({
        prompt_tokens: z.number().int().nonnegative().default(0),
        completion_tokens: z.number().int().nonnegative().default(0),
      })
      .default({ prompt_tokens: 0, completion_tokens: 0 }),
  });
  return {
    url: `${config.modelBaseUrl.replace(/\/$/, '')}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.modelAuthHeader]: `${config.modelAuthPrefix ? `${config.modelAuthPrefix} ` : ''}${config.modelApiKey}`,
      },
      body: JSON.stringify({
        model: config.modelName,
        messages: [{ role: 'system', content: input.system }, ...messages],
        temperature: input.temperature ?? 0.2,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.jsonSchema && config.modelJsonMode
          ? { response_format: { type: 'json_object' } }
          : {}),
      }),
    },
    decode: (raw: unknown) => {
      const parsed = responseSchema.parse(raw);
      return {
        text: parsed.choices[0]?.message.content ?? '',
        usage: {
          promptTokens: parsed.usage.prompt_tokens,
          completionTokens: parsed.usage.completion_tokens,
        },
      };
    },
  };
}

export function stripFences(text: string): string {
  return /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim())?.[1] ?? text.trim();
}

export function createLlmClient(db: LifeDatabase, config: Config, fetchImpl: typeof fetch = fetch) {
  return {
    async chat<T = unknown>(input: ChatInput<T>): Promise<ChatResult<T>> {
      const purpose = input.purpose ?? /TASK:(\w+)/.exec(input.system)?.[1] ?? 'chat';
      const start = performance.now();
      const usage = { promptTokens: 0, completionTokens: 0 };
      let retries = 0;
      const log = (mode: ChatResult['mode'], ok: boolean, code: string | null = null) => {
        db.prepare(
          `INSERT INTO llm_calls (id,purpose,model,latency_ms,prompt_tokens,completion_tokens,retries,ok,created_at,mode,error_code) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        ).run(
          randomUUID(),
          purpose,
          mode === 'live' ? config.modelName : 'mock/lifeos-v1',
          Math.round(performance.now() - start),
          mode === 'live' ? usage.promptTokens : 0,
          mode === 'live' ? usage.completionTokens : 0,
          retries,
          Number(ok),
          new Date().toISOString(),
          mode,
          code,
        );
      };
      const mock = (fallback: boolean): ChatResult<T> => {
        const raw: unknown = JSON.parse(
          input.messages.find((message) => message.role === 'user')?.content ?? '{}',
        );
        const result = mockOutput(purpose, raw);
        const json = input.jsonSchema ? input.jsonSchema.parse(result) : undefined;
        const mode = fallback ? 'fallback' : 'mock';
        log(mode, true);
        return {
          text: JSON.stringify(result),
          ...(json !== undefined ? { json } : {}),
          usage: { promptTokens: 0, completionTokens: 0 },
          latencyMs: Math.round(performance.now() - start),
          mode,
          fallback,
        };
      };
      if (config.mockMode) return mock(false);
      const messages = [...input.messages];
      const system = input.jsonSchema
        ? `${input.system}\nReturn JSON only. Schema:\n${JSON.stringify(z.toJSONSchema(input.jsonSchema, { unrepresentable: 'any' }))}`
        : input.system;
      let failure = new AppError(
        502,
        'MODEL_UNAVAILABLE',
        'The model could not complete this request. Retry or explicitly enable mock mode.',
      );
      for (let attempt = 0; attempt < (input.maxAttempts ?? 3); attempt++) {
        retries = attempt;
        let text = '';
        try {
          if (!config.modelApiKey || config.modelBaseUrl.includes('api.example.com'))
            throw new AppError(
              503,
              'MODEL_NOT_CONFIGURED',
              'Configure MODEL_BASE_URL, MODEL_API_KEY, and MODEL_NAME, or enable MOCK_MODE.',
            );
          const protocol = mapProviderProtocol(config, { ...input, system }, messages);
          const response = await fetchImpl(protocol.url, {
            ...protocol.init,
            signal: AbortSignal.timeout(config.modelTimeoutMs),
          });
          if (!response.ok)
            throw new AppError(
              502,
              response.status === 401 || response.status === 403
                ? 'MODEL_AUTH_ERROR'
                : 'MODEL_HTTP_ERROR',
              `The model endpoint returned HTTP ${response.status}. Check configuration or retry.`,
            );
          const raw: unknown = await response.json();
          const decoded = protocol.decode(raw);
          text = decoded.text;
          if (text.length > 100_000)
            throw new AppError(
              502,
              'MODEL_OUTPUT_TOO_LARGE',
              'The model returned an oversized response.',
            );
          usage.promptTokens += decoded.usage.promptTokens;
          usage.completionTokens += decoded.usage.completionTokens;
          const json = input.jsonSchema
            ? input.jsonSchema.parse(JSON.parse(stripFences(text)) as unknown)
            : undefined;
          log('live', true);
          return {
            text,
            ...(json !== undefined ? { json } : {}),
            usage,
            latencyMs: Math.round(performance.now() - start),
            mode: 'live',
            fallback: false,
          };
        } catch (error) {
          if (error instanceof z.ZodError || error instanceof SyntaxError) {
            const detail =
              error instanceof z.ZodError
                ? error.issues
                    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                    .join('; ')
                : 'Output was not valid JSON.';
            messages.push(
              { role: 'assistant', content: text.slice(0, 16_000) },
              {
                role: 'user',
                content: `Your previous output was invalid: ${detail}. Return corrected JSON only.`,
              },
            );
            failure = new AppError(
              502,
              'MODEL_INVALID_OUTPUT',
              'The model returned invalid structured output after repair attempts. Please retry.',
            );
          } else if (error instanceof AppError) {
            failure = error;
            if (['MODEL_NOT_CONFIGURED', 'MODEL_AUTH_ERROR'].includes(error.code)) break;
          } else {
            const timeout =
              error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name);
            failure = new AppError(
              timeout ? 504 : 502,
              timeout ? 'MODEL_TIMEOUT' : 'MODEL_UNAVAILABLE',
              timeout
                ? 'The model request timed out. Please retry.'
                : 'The model endpoint could not be reached. Please retry.',
            );
          }
        }
      }
      log('live', false, failure.code);
      if (config.mockFallback) return mock(true);
      throw failure;
    },
  };
}
export type LlmClient = ReturnType<typeof createLlmClient>;

/** Standalone entry point. The server injects its existing DB via createLlmClient. */
export async function chat<T = unknown>(input: ChatInput<T>): Promise<ChatResult<T>> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  try {
    return await createLlmClient(db, config).chat(input);
  } finally {
    closeDatabase(db);
  }
}
