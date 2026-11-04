import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createLlmClient, mapProviderProtocol } from '../src/llm/client.js';
import { understandSchema } from '../src/agent/schemas.js';
import { UNDERSTAND_PROMPT } from '../src/llm/prompts.js';
import { createFixture } from './helpers.js';

describe('model adapter', () => {
  let fixture: ReturnType<typeof createFixture>;
  beforeEach(() => {
    fixture = createFixture({
      MOCK_MODE: 'false',
      MODEL_BASE_URL: 'https://model.test/v1',
      MODEL_API_KEY: 'test-placeholder',
    });
  });
  afterEach(() => fixture.close());
  const envelope = (content: string) =>
    new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
      { status: 200 },
    );

  it('repairs invalid JSON and invalid schema output, strips fences, and logs actual attempts', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(envelope('not json'))
      .mockResolvedValueOnce(envelope('{"count":"bad"}'))
      .mockResolvedValueOnce(envelope('```json\n{"count":3}\n```'));
    const result = await createLlmClient(fixture.db, fixture.config, transport).chat({
      system: 'TASK:plan',
      messages: [{ role: 'user', content: '{}' }],
      jsonSchema: z.object({ count: z.number() }),
    });
    expect(result.json).toEqual({ count: 3 });
    expect(result.usage).toEqual({ promptTokens: 30, completionTokens: 15 });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(String(transport.mock.calls[1]?.[1]?.body)).toContain(
      'Your previous output was invalid:',
    );
    expect(fixture.db.prepare('SELECT retries,ok,mode FROM llm_calls').get()).toEqual({
      retries: 2,
      ok: 1,
      mode: 'live',
    });
  });

  it('fails clearly after two repair retries without silently switching to mock', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => envelope('{}'));
    await expect(
      createLlmClient(fixture.db, fixture.config, transport).chat({
        system: UNDERSTAND_PROMPT,
        messages: [{ role: 'user', content: '{}' }],
        jsonSchema: understandSchema,
      }),
    ).rejects.toMatchObject({ code: 'MODEL_INVALID_OUTPUT' });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(fixture.db.prepare('SELECT ok,error_code FROM llm_calls').get()).toEqual({
      ok: 0,
      error_code: 'MODEL_INVALID_OUTPUT',
    });
  });

  it('only falls back when enabled and records the failed live call separately', async () => {
    const transport = vi.fn<typeof fetch>().mockRejectedValue(new Error('network'));
    const result = await createLlmClient(
      fixture.db,
      { ...fixture.config, mockFallback: true },
      transport,
    ).chat({
      system: UNDERSTAND_PROMPT,
      messages: [{ role: 'user', content: '{"goal":"Prepare for Friday"}' }],
      jsonSchema: understandSchema,
    });
    expect(result).toMatchObject({
      mode: 'fallback',
      fallback: true,
      usage: { promptTokens: 0, completionTokens: 0 },
    });
    expect(fixture.db.prepare('SELECT mode,ok FROM llm_calls ORDER BY rowid').all()).toEqual([
      { mode: 'live', ok: 0 },
      { mode: 'fallback', ok: 1 },
    ]);
  });

  it('maps configurable auth and JSON mode in one protocol boundary', () => {
    const protocol = mapProviderProtocol(
      {
        ...fixture.config,
        modelAuthHeader: 'X-API-Key',
        modelAuthPrefix: '',
        modelJsonMode: false,
      },
      { system: 'system', messages: [], jsonSchema: z.object({}) },
      [],
    );
    expect(protocol.url).toBe('https://model.test/v1/chat/completions');
    expect(protocol.init.headers['X-API-Key']).toBe('test-placeholder');
    expect(protocol.init.body).not.toContain('response_format');
  });

  it('reports timeout and auth failures using safe error codes', async () => {
    const timeout = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    await expect(
      createLlmClient(fixture.db, fixture.config, timeout).chat({
        system: 'TASK:understand',
        messages: [],
      }),
    ).rejects.toMatchObject({ code: 'MODEL_TIMEOUT' });
    const auth = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret upstream response', { status: 401 }));
    await expect(
      createLlmClient(fixture.db, fixture.config, auth).chat({
        system: 'TASK:understand',
        messages: [],
      }),
    ).rejects.toMatchObject({ code: 'MODEL_AUTH_ERROR' });
    expect(auth).toHaveBeenCalledTimes(1);
  });
});
