import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CLIENT_ORIGIN: z
    .url()
    .refine((value) => new URL(value).origin === value, {
      message: 'Use an exact origin without a path or trailing slash',
    })
    .default('http://localhost:5173'),
  DATABASE_PATH: z.string().trim().min(1).default('server/data/lifeos.db'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  MOCK_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MODEL_BASE_URL: z.url().default('https://api.example.com/v1'),
  MODEL_API_KEY: z.string().default(''),
  MODEL_NAME: z.string().trim().min(1).default('meta-model-configure-me'),
  MODEL_AUTH_HEADER: z
    .string()
    .regex(/^[A-Za-z0-9-]+$/)
    .default('Authorization'),
  MODEL_AUTH_PREFIX: z.string().default('Bearer'),
  MODEL_JSON_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(8000),
  MOCK_FALLBACK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EMBEDDINGS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  EMBEDDINGS_BASE_URL: z.url().optional(),
  EMBEDDINGS_API_KEY: z.string().optional(),
  EMBEDDINGS_MODEL: z.string().trim().min(1).default('embedding-model-configure-me'),
  EMBEDDINGS_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(8000),
  EMBEDDINGS_WEIGHT: z.coerce.number().min(0).max(1).default(0.35),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  host: string;
  port: number;
  clientOrigin: string;
  databasePath: string;
  rateLimitMax: number;
  mockMode: boolean;
  modelBaseUrl: string;
  modelApiKey: string;
  modelName: string;
  modelAuthHeader: string;
  modelAuthPrefix: string;
  modelJsonMode: boolean;
  modelTimeoutMs: number;
  mockFallback: boolean;
  embeddingsEnabled: boolean;
  embeddingsBaseUrl: string;
  embeddingsApiKey: string;
  embeddingsModel: string;
  embeddingsTimeoutMs: number;
  embeddingsWeight: number;
}

export function parseConfig(environment: Record<string, string | undefined>): Config {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    // Report field names and validation messages, never environment values or credentials.
    throw new Error(
      `Invalid configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
    );
  }
  const env = parsed.data;
  return {
    nodeEnv: env.NODE_ENV,
    host: env.HOST,
    port: env.PORT,
    clientOrigin: env.CLIENT_ORIGIN,
    databasePath:
      env.DATABASE_PATH === ':memory:'
        ? ':memory:'
        : path.resolve(repositoryRoot, env.DATABASE_PATH),
    rateLimitMax: env.RATE_LIMIT_MAX,
    mockMode: env.MOCK_MODE,
    modelBaseUrl: env.MODEL_BASE_URL,
    modelApiKey: env.MODEL_API_KEY,
    modelName: env.MODEL_NAME,
    modelAuthHeader: env.MODEL_AUTH_HEADER,
    modelAuthPrefix: env.MODEL_AUTH_PREFIX,
    modelJsonMode: env.MODEL_JSON_MODE,
    modelTimeoutMs: env.MODEL_TIMEOUT_MS,
    mockFallback: env.MOCK_FALLBACK,
    embeddingsEnabled: env.EMBEDDINGS_ENABLED,
    embeddingsBaseUrl: env.EMBEDDINGS_BASE_URL ?? env.MODEL_BASE_URL,
    embeddingsApiKey: env.EMBEDDINGS_API_KEY ?? env.MODEL_API_KEY,
    embeddingsModel: env.EMBEDDINGS_MODEL,
    embeddingsTimeoutMs: env.EMBEDDINGS_TIMEOUT_MS,
    embeddingsWeight: env.EMBEDDINGS_WEIGHT,
  };
}

export function loadConfig(): Config {
  dotenv.config({ path: path.join(repositoryRoot, '.env') });
  return parseConfig(process.env);
}
