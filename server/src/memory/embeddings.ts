import { z } from 'zod';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';

export interface Embedder {
  model: string;
  /** Weight of the semantic component when blended with normalized keyword scores. */
  weight: number;
  embed(texts: string[]): Promise<number[][]>;
}

const embeddingResponseSchema = z.object({
  data: z
    .array(
      z.object({
        index: z.number().int().nonnegative().default(0),
        embedding: z.array(z.number().finite()).min(1),
      }),
    )
    .min(1),
});

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let index = 0; index < a.length; index++) {
    const left = a[index] ?? 0;
    const right = b[index] ?? 0;
    dot += left * right;
    aNorm += left * left;
    bNorm += right * right;
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / Math.sqrt(aNorm * bNorm);
}

/**
 * Optional semantic layer over the keyword baseline. Returns null unless
 * EMBEDDINGS_ENABLED=true, so the offline demo never needs a network call.
 */
export function createEmbedder(config: Config, fetchImpl: typeof fetch = fetch): Embedder | null {
  if (!config.embeddingsEnabled) return null;
  const baseUrl = config.embeddingsBaseUrl.replace(/\/$/, '');
  return {
    model: config.embeddingsModel,
    weight: config.embeddingsWeight,
    async embed(texts) {
      if (texts.length === 0) return [];
      if (!config.embeddingsApiKey || baseUrl.includes('api.example.com'))
        throw new AppError(
          503,
          'EMBEDDINGS_NOT_CONFIGURED',
          'Configure EMBEDDINGS_BASE_URL, EMBEDDINGS_API_KEY, and EMBEDDINGS_MODEL, or disable EMBEDDINGS_ENABLED.',
        );
      const response = await fetchImpl(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [config.modelAuthHeader]: `${config.modelAuthPrefix ? `${config.modelAuthPrefix} ` : ''}${config.embeddingsApiKey}`,
        },
        body: JSON.stringify({ model: config.embeddingsModel, input: texts }),
        signal: AbortSignal.timeout(config.embeddingsTimeoutMs),
      });
      if (!response.ok)
        throw new AppError(
          502,
          'EMBEDDINGS_HTTP_ERROR',
          `The embeddings endpoint returned HTTP ${response.status}.`,
        );
      const parsed = embeddingResponseSchema.parse(await response.json());
      const vectors = [...parsed.data]
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
      if (vectors.length !== texts.length)
        throw new AppError(
          502,
          'EMBEDDINGS_INVALID_OUTPUT',
          'The embeddings endpoint returned a different number of vectors than inputs.',
        );
      const dimension = vectors[0]?.length ?? 0;
      if (vectors.some((vector) => vector.length !== dimension))
        throw new AppError(
          502,
          'EMBEDDINGS_INVALID_OUTPUT',
          'The embeddings endpoint returned inconsistent vector dimensions.',
        );
      return vectors;
    },
  };
}
