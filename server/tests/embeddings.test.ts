import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseConfig } from '../src/config.js';
import { cosineSimilarity, type Embedder } from '../src/memory/embeddings.js';
import { createFixture } from './helpers.js';

function stubEmbedder(vectors: Record<string, number[]>): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return {
    model: 'test-embeddings',
    weight: 0.5,
    calls,
    async embed(texts) {
      calls.push(texts);
      return texts.map((text) => vectors[text] ?? [0, 0, 1]);
    },
  };
}

describe('optional hybrid retrieval', () => {
  let fixture: ReturnType<typeof createFixture>;
  beforeEach(() => {
    fixture = createFixture();
  });
  afterEach(() => fixture.close());

  it('finds a semantically related memory with no keyword overlap and caches its vector', async () => {
    const tone = fixture.memories.addMemory({
      type: 'preference',
      key: 'writing_tone',
      value: 'Use a warm, direct tone.',
      confidence: 0.9,
    });
    fixture.memories.addMemory({
      type: 'fact',
      key: 'budget_deadline',
      value: 'Budget closes on Friday.',
      confidence: 0.9,
    });
    const embedder = stubEmbedder({
      'Help me shape the quarterly narrative': [1, 0, 0],
      'writing_tone: Use a warm, direct tone.': [1, 0, 0],
      'budget_deadline: Budget closes on Friday.': [0, 1, 0],
    });
    const first = await fixture.memories.retrieveRelevantHybrid(
      'Help me shape the quarterly narrative',
      2,
      embedder,
    );
    expect(first[0]).toMatchObject({ id: tone.id, key: 'writing_tone' });
    expect(first[0]?.why_retrieved).toContain('Hybrid semantic 100%');
    expect(first[0]?.score).toBeCloseTo(0.45, 5);
    expect(embedder.calls).toHaveLength(2);
    expect(fixture.db.prepare('SELECT count(*) AS count FROM memory_embeddings').get()).toEqual({
      count: 2,
    });

    await fixture.memories.retrieveRelevantHybrid(
      'Help me shape the quarterly narrative',
      2,
      embedder,
    );
    expect(embedder.calls).toHaveLength(3);
    expect(embedder.calls[2]).toEqual(['Help me shape the quarterly narrative']);
  });

  it('falls back to keyword retrieval when the embeddings call fails', async () => {
    fixture.memories.addMemory({
      type: 'preference',
      key: 'email_style',
      value: 'Use short bullets.',
      confidence: 0.9,
    });
    const failing: Embedder = {
      model: 'test-embeddings',
      weight: 0.5,
      embed: async () => {
        throw new Error('endpoint down');
      },
    };
    const memories = await fixture.memories.retrieveRelevantHybrid('email bullets', 5, failing);
    expect(memories.map((memory) => memory.key)).toEqual(['email_style']);
    expect(memories[0]?.why_retrieved).toContain('Matched');
  });

  it('keeps keyword retrieval working with no embedder at all', async () => {
    fixture.memories.addMemory({
      type: 'preference',
      key: 'email_style',
      value: 'Use short bullets.',
      confidence: 0.9,
    });
    const memories = await fixture.memories.retrieveRelevantHybrid('email bullets', 5, null);
    expect(memories.map((memory) => memory.key)).toEqual(['email_style']);
  });

  it('reports retrieval mode without claiming unconfigured embeddings are active', async () => {
    const plain = await request(fixture.app).get('/api/health').expect(200);
    expect(plain.body).toMatchObject({ phase: 8, retrieval: 'keyword' });
    const hybrid = createFixture({ EMBEDDINGS_ENABLED: 'true' });
    try {
      const response = await request(hybrid.app).get('/api/health').expect(200);
      expect(response.body).toMatchObject({
        retrieval: 'hybrid',
        embeddingsConfigured: false,
      });
    } finally {
      hybrid.close();
    }
  });

  it('parses embedding configuration with model fallbacks and computes cosine similarity', () => {
    const config = parseConfig({ EMBEDDINGS_ENABLED: 'true' });
    expect(config).toMatchObject({
      embeddingsEnabled: true,
      embeddingsBaseUrl: config.modelBaseUrl,
      embeddingsApiKey: config.modelApiKey,
      embeddingsWeight: 0.35,
    });
    expect(parseConfig({}).embeddingsEnabled).toBe(false);
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});
