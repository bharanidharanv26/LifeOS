import { describe, expect, it, vi } from 'vitest';
import { runModelPing } from '../scripts/model-ping.js';
import { parseConfig } from '../src/config.js';

const config = parseConfig({
  DATABASE_PATH: ':memory:',
  MOCK_MODE: 'false',
  MODEL_BASE_URL: 'https://model.test/v1',
  MODEL_NAME: 'test-model',
  MODEL_API_KEY: 'fixture-credential-not-a-real-key',
});

describe('model connection diagnostic', () => {
  it.each([401, 503])(
    'reports HTTP %s with the redacted raw error and exactly one request',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: `Rejected ${config.modelApiKey}`,
            access_token: 'fixture-token',
            code: 'upstream_failure',
          }),
          { status },
        ),
      );
      const write = vi.fn<(message: string) => void>();
      expect(await runModelPing(config, transport, write)).toBe(1);
      expect(transport).toHaveBeenCalledTimes(1);
      const output = write.mock.calls[0]?.[0] ?? '';
      expect(output).toContain('FAIL | model: test-model | mode: live');
      expect(output).toMatch(/latency: \d+ ms \| tokens: unavailable/);
      expect(output).toContain(`HTTP: ${status}`);
      expect(output).toContain('upstream_failure');
      expect(output).toContain('[REDACTED]');
      expect(output).not.toContain(config.modelApiKey);
      expect(output).not.toContain('fixture-token');
    },
  );

  it('reports malformed successful responses without leaking an echoed credential', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(`not JSON ${config.modelApiKey}`));
    const write = vi.fn<(message: string) => void>();
    expect(await runModelPing(config, transport, write)).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain('not JSON [REDACTED]');
  });

  it('handles a timeout without inventing an error body or token count', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('Timeout', 'TimeoutError'));
    const write = vi.fn<(message: string) => void>();
    expect(await runModelPing(config, transport, write)).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain('timed out');
    expect(write.mock.calls[0]?.[0]).toContain('(no response body received)');
  });

  it('reports provider tokens and caps the tiny request at eight output tokens', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'OK' } }],
          usage: { prompt_tokens: 6, completion_tokens: 1 },
        }),
      ),
    );
    const write = vi.fn<(message: string) => void>();
    expect(await runModelPing(config, transport, write)).toBe(0);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: 'test-model',
      max_tokens: 8,
    });
    expect(write.mock.calls[0]?.[0]).toContain('tokens: 7 (6 prompt + 1 completion');
  });

  it('labels mock mode honestly and makes no network request', async () => {
    const transport = vi.fn<typeof fetch>();
    const write = vi.fn<(message: string) => void>();
    expect(await runModelPing({ ...config, mockMode: true }, transport, write)).toBe(0);
    expect(transport).not.toHaveBeenCalled();
    expect(write.mock.calls[0]?.[0]).toContain('SIMULATED: no model endpoint was contacted.');
  });

  it('never reports a simulated fallback as a successful live connection', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Provider unavailable', { status: 503 }));
    const write = vi.fn<(message: string) => void>();
    expect(await runModelPing({ ...config, mockFallback: true }, transport, write)).toBe(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]?.[0]).toContain('FAIL');
    expect(write.mock.calls[0]?.[0]).toContain('Provider unavailable');
  });
});
