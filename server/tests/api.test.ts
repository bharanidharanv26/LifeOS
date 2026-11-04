import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseConfig, repositoryRoot } from '../src/config.js';
import { createFixture } from './helpers.js';

const createdMemorySchema = z.object({ memory: z.object({ id: z.uuid(), value: z.string() }) });
const memoryInput = { type: 'preference', key: 'email_style', value: 'Use short bullets.' };

describe('Phase 1 REST API', () => {
  let fixture: ReturnType<typeof createFixture>;
  beforeEach(() => {
    fixture = createFixture({ MODEL_API_KEY: 'secret-never-return-this' });
  });
  afterEach(() => {
    fixture.close();
  });

  it('reports the database, model name, and mock mode without leaking configuration', async () => {
    const response = await request(fixture.app).get('/api/health').expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      phase: expect.any(Number),
      database: 'connected',
      mockMode: true,
      model: fixture.config.modelName,
      modelIntegration: 'available',
    });
    expect(response.text).not.toContain('secret-never-return-this');
    expect(response.text).not.toContain('databasePath');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('creates, lists, filters, edits, archives, restores, and deletes a memory', async () => {
    const created = await request(fixture.app).post('/api/memories').send(memoryInput).expect(201);
    const id = createdMemorySchema.parse(created.body).memory.id;
    const listed = await request(fixture.app)
      .get('/api/memories?type=preference&search=bullets')
      .expect(200);
    expect(listed.body).toMatchObject({
      total: 1,
      memories: [{ id, source: 'user', confidence: 0.8 }],
    });
    await request(fixture.app)
      .patch(`/api/memories/${id}`)
      .send({ value: 'Use three bullets.' })
      .expect(200);
    await request(fixture.app).get(`/api/memories/${id}`).expect(200);
    const history = await request(fixture.app)
      .get(`/api/memories/${id}/history?limit=1`)
      .expect(200);
    expect(history.body).toMatchObject({ events: [{ event: 'edited' }] });
    await request(fixture.app).patch(`/api/memories/${id}`).send({ archived: true }).expect(200);
    expect((await request(fixture.app).get('/api/memories')).body).toMatchObject({ total: 0 });
    expect(
      (await request(fixture.app).get('/api/memories?include_archived=true')).body,
    ).toMatchObject({ total: 1 });
    await request(fixture.app).patch(`/api/memories/${id}`).send({ archived: false }).expect(200);
    await request(fixture.app).delete(`/api/memories/${id}`).expect(200);
    await request(fixture.app).get(`/api/memories/${id}`).expect(404);
    const deletedHistory = await request(fixture.app)
      .get(`/api/memories/${id}/history`)
      .expect(200);
    expect(deletedHistory.body).toMatchObject({
      events: expect.arrayContaining([expect.objectContaining({ event: 'deleted' })]),
    });
  });

  it('rejects invalid, unknown, oversized-field, and empty mutation bodies', async () => {
    for (const body of [
      { ...memoryInput, confidence: 1.1 },
      { ...memoryInput, type: 'unknown' },
      { ...memoryInput, source: 'robot' },
      { ...memoryInput, value: ' ' },
      { ...memoryInput, value: 'a'.repeat(4001) },
      { ...memoryInput, surprise: true },
      {},
    ]) {
      const response = await request(fixture.app).post('/api/memories').send(body).expect(400);
      expect(response.body).toMatchObject({
        error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
      });
    }
    const created = await request(fixture.app).post('/api/memories').send(memoryInput).expect(201);
    const id = createdMemorySchema.parse(created.body).memory.id;
    await request(fixture.app).patch(`/api/memories/${id}`).send({}).expect(400);
    await request(fixture.app).delete(`/api/memories/${id}`).send({ unexpected: true }).expect(400);
    await request(fixture.app).post('/api/demo/seed').send({ unexpected: true }).expect(400);
    await request(fixture.app).post('/api/memories/retrieve').send({ query: '' }).expect(400);
  });

  it('validates IDs, pagination, filters, and unknown API routes with consistent errors', async () => {
    for (const route of [
      '/api/memories/not-an-id',
      '/api/memories?limit=0',
      '/api/memories?offset=-1',
      '/api/memories?include_archived=yes',
      '/api/memories?unknown=true',
      '/api/memories?type=other',
    ]) {
      const response = await request(fixture.app).get(route).expect(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
    }
    expect(
      (await request(fixture.app).get(`/api/memories/${randomUUID()}`).expect(404)).body,
    ).toMatchObject({ error: { code: 'MEMORY_NOT_FOUND' } });
    expect((await request(fixture.app).get('/api/not-a-route').expect(404)).body).toEqual({
      error: { code: 'NOT_FOUND', message: 'This API route does not exist.' },
    });
  });

  it('returns a conflict for duplicate active memories and preserves the original', async () => {
    await request(fixture.app).post('/api/memories').send(memoryInput).expect(201);
    const conflict = await request(fixture.app).post('/api/memories').send(memoryInput).expect(409);
    expect(conflict.body).toMatchObject({ error: { code: 'CONFLICT' } });
    expect(fixture.memories.list().total).toBe(1);
  });

  it('undoes deletion with the same identity, confidence, and confirmation history', async () => {
    const memory = fixture.memories.addMemory({ ...memoryInput, type: 'preference' });
    fixture.memories.reinforce(memory.id);
    await request(fixture.app).delete(`/api/memories/${memory.id}`).expect(200);
    const restored = await request(fixture.app)
      .post(`/api/memories/${memory.id}/restore`)
      .send({})
      .expect(200);
    expect(restored.body).toMatchObject({
      memory: { id: memory.id, confidence: 0.9, times_confirmed: 1 },
    });
    await request(fixture.app).post(`/api/memories/${memory.id}/restore`).send({}).expect(409);
    expect(fixture.memories.history(memory.id)[0]?.detail).toContain('Deletion undone');
  });

  it('seeds idempotently and exposes memory-aware retrieval explanations', async () => {
    expect((await request(fixture.app).post('/api/demo/seed').send({}).expect(200)).body).toEqual({
      inserted: 5,
      skipped: 0,
      total: 5,
    });
    expect((await request(fixture.app).post('/api/demo/seed').expect(200)).body).toEqual({
      inserted: 0,
      skipped: 5,
      total: 5,
    });
    const retrieved = await request(fixture.app)
      .post('/api/memories/retrieve')
      .send({ query: 'Prepare for my Friday investor call.', k: 3 })
      .expect(200);
    const result = z
      .object({
        memories: z.array(
          z.object({ key: z.string(), score: z.number(), why_retrieved: z.string() }),
        ),
      })
      .parse(retrieved.body);
    expect(result.memories).toHaveLength(3);
    expect(result.memories.map((memory) => memory.key)).toContain('investor_update_day');
    expect(
      result.memories.every(
        (memory) => memory.score > 0 && memory.why_retrieved.includes('Matched'),
      ),
    ).toBe(true);
  });

  it('requires explicit confirmation for a full reset and then allows a clean reseed', async () => {
    await request(fixture.app).post('/api/demo/seed').send({}).expect(200);
    await request(fixture.app).post('/api/demo/reset').send({}).expect(400);
    await request(fixture.app).post('/api/demo/reset').send({ confirm: true }).expect(400);
    expect(fixture.memories.list().total).toBe(5);
    expect(
      (
        await request(fixture.app)
          .post('/api/demo/reset')
          .send({ confirm: 'FORGET EVERYTHING' })
          .expect(200)
      ).body,
    ).toEqual({ reset: true, deleted: 15 });
    expect(fixture.memories.list().total).toBe(0);
    expect(
      (await request(fixture.app).post('/api/demo/seed').send({}).expect(200)).body,
    ).toMatchObject({ inserted: 5 });
  });

  it('restricts CORS to the configured client origin, including browser preflight', async () => {
    const allowed = await request(fixture.app)
      .get('/api/health')
      .set('Origin', fixture.config.clientOrigin)
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(fixture.config.clientOrigin);
    const denied = await request(fixture.app)
      .post('/api/demo/seed')
      .set('Origin', 'https://untrusted.example')
      .send({})
      .expect(403);
    expect(denied.body).toMatchObject({ error: { code: 'ORIGIN_NOT_ALLOWED' } });
    expect(fixture.memories.list().total).toBe(0);
    const preflight = await request(fixture.app)
      .options('/api/memories')
      .set('Origin', fixture.config.clientOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(preflight.headers['access-control-allow-methods']).toContain('POST');
  });

  it('enforces JSON content type, JSON validity, and the 32 KB request limit', async () => {
    expect(
      (await request(fixture.app).post('/api/memories').type('text').send('hello').expect(415))
        .body,
    ).toMatchObject({ error: { code: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(
      (await request(fixture.app).post('/api/memories').type('json').send('{broken').expect(400))
        .body,
    ).toMatchObject({ error: { code: 'INVALID_JSON' } });
    expect(
      (
        await request(fixture.app)
          .post('/api/memories')
          .send({ ...memoryInput, value: 'x'.repeat(40_000) })
          .expect(413)
      ).body,
    ).toMatchObject({ error: { code: 'BODY_TOO_LARGE' } });
  });

  it('rate limits API traffic with the standard error shape and Retry-After', async () => {
    const limited = createFixture({ RATE_LIMIT_MAX: '2' });
    try {
      await request(limited.app).get('/api/health').expect(200);
      await request(limited.app).get('/api/health').expect(200);
      const response = await request(limited.app).get('/api/health').expect(429);
      expect(response.body).toMatchObject({
        error: { code: 'RATE_LIMITED', message: expect.any(String) },
      });
      expect(response.headers['retry-after']).toBeDefined();
    } finally {
      limited.close();
    }
  });
});

describe('environment configuration', () => {
  it('defaults to offline mode, handles false explicitly, and resolves database paths from the repo root', () => {
    expect(parseConfig({}).mockMode).toBe(true);
    const config = parseConfig({ MOCK_MODE: 'false', DATABASE_PATH: 'server/data/custom.db' });
    expect(config.mockMode).toBe(false);
    expect(config.databasePath.startsWith(repositoryRoot)).toBe(true);
  });

  it('rejects invalid ports, booleans, and origins without exposing environment values', () => {
    expect(() => parseConfig({ PORT: 'not-a-port' })).toThrow('PORT');
    expect(() => parseConfig({ MOCK_MODE: 'yes' })).toThrow('MOCK_MODE');
    expect(() => parseConfig({ CLIENT_ORIGIN: 'https://example.com/path' })).toThrow(
      'CLIENT_ORIGIN',
    );
    expect(() => parseConfig({ MODEL_BASE_URL: 'secret-value-that-is-not-a-url' })).toThrow(
      'MODEL_BASE_URL',
    );
    try {
      parseConfig({ MODEL_BASE_URL: 'secret-value-that-is-not-a-url' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-value-that-is-not-a-url');
    }
  });
});
