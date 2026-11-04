import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentService } from '../src/agent/service.js';
import { checkPolicy } from '../src/agent/policy.js';
import { createLlmClient } from '../src/llm/client.js';
import { seedDemo } from '../src/demo/service.js';
import { createFixture } from './helpers.js';

describe('planning and policy', () => {
  let fixture: ReturnType<typeof createFixture>;
  let agent: AgentService;
  beforeEach(() => {
    fixture = createFixture();
    seedDemo(fixture.db, fixture.clock);
    agent = new AgentService(
      fixture.db,
      createLlmClient(fixture.db, fixture.config),
      fixture.clock,
    );
  });
  afterEach(() => fixture.close());

  it('ordinary mock plans respect seed preferences, cite memory, and never execute', async () => {
    const result = await agent.createSession('Prepare for my Friday investor call.');
    const block = result.plan?.steps.find((step) => step.tool === 'create_calendar_block');
    expect(new Date(String(block?.args.start)).getUTCHours()).toBe(11);
    expect(block?.policy_warnings).toEqual([]);
    expect(block?.memory_ids.length).toBeGreaterThan(0);
    expect(result.plan?.steps.every((step) => step.status === 'proposed')).toBe(true);
    expect(fixture.db.prepare('SELECT count(*) AS count FROM calendar_events').get()).toEqual({
      count: 0,
    });
    expect(fixture.db.prepare('SELECT purpose,mode FROM llm_calls').all()).toEqual([
      { purpose: 'understand', mode: 'mock' },
      { purpose: 'plan', mode: 'mock' },
    ]);
  });

  it('uses learned morning and email preferences in a subsequent mock plan', async () => {
    fixture.memories.upsertMemory({
      type: 'preference',
      key: 'no_morning_blocks',
      value: 'Avoid morning blocks.',
      source: 'inferred',
    });
    fixture.memories.upsertMemory({
      type: 'preference',
      key: 'email_style',
      value: 'Use this as a style example:\nHello team,\n- Three decisions\nWhat do you think?',
      source: 'inferred',
    });
    const result = await agent.createSession("Get ready for next week's board meeting.", true);
    const block = result.plan?.steps.find((step) => step.tool === 'create_calendar_block');
    expect(new Date(String(block?.args.start)).getUTCHours()).toBe(12);
    expect(result.plan?.steps.find((step) => step.tool === 'draft_email')?.args.body).toContain(
      'What do you think?',
    );
  });

  it('labels and blocks the guided early fixture; a safe edit records a repair', async () => {
    const result = await agent.createSession('Prepare for my Friday investor call.', true);
    const step = result.plan?.steps.find((item) => item.tool === 'create_calendar_block');
    if (!step) throw new Error('Expected prep');
    expect(step.demo_fixture).toBe(true);
    expect(new Date(String(step.args.start)).getUTCHours()).toBe(9);
    expect(step.policy_warnings[0]?.blocking).toBe(true);
    expect(() => agent.reviewStep(step.id, 'approve')).toThrow('conflicts');
    const start = new Date(String(step.args.start));
    start.setUTCHours(11);
    const edited = agent.reviewStep(step.id, 'edit', {
      args: {
        ...step.args,
        start: start.toISOString(),
        end: new Date(start.getTime() + 25 * 60000).toISOString(),
      },
    });
    expect(edited.status).toBe('edited');
    expect(edited.policy_warnings[0]).toMatchObject({ blocking: false, repaired: true });
  });

  it('checks UTC time, protected Friday afternoons, and long prep blocks deterministically', async () => {
    const result = await agent.createSession('Prepare for Friday.', true);
    const step = result.plan?.steps.find((item) => item.tool === 'create_calendar_block');
    if (!step) throw new Error('Expected prep');
    const warnings = checkPolicy(
      {
        ...step,
        args: {
          title: 'Prep',
          start: '2026-11-06T14:00:00Z',
          end: '2026-11-06T15:00:00Z',
          notes: '',
        },
      },
      fixture.memories.list().memories,
    );
    expect(warnings).toHaveLength(2);
    expect(
      checkPolicy(
        {
          ...step,
          args: {
            title: 'Prep',
            start: '2026-11-06T11:00:00+03:00',
            end: '2026-11-06T11:25:00+03:00',
            notes: '',
          },
        },
        fixture.memories.list().memories,
      ).length,
    ).toBeGreaterThan(0);
  });

  it('validates planning and review API payloads and persists explicit decisions', async () => {
    await request(fixture.app).post('/api/sessions').send({ goal: 'x' }).expect(400);
    const result = await agent.createSession('Prepare for my Friday investor call.', true);
    const step = result.plan?.steps[0];
    if (!step) throw new Error('Expected step');
    await request(fixture.app)
      .post(`/api/steps/${step.id}/reject`)
      .send({ reason: '' })
      .expect(400);
    await request(fixture.app)
      .post(`/api/steps/${step.id}/reject`)
      .send({ reason: 'too early' })
      .expect(200);
    expect(agent.getStep(step.id).status).toBe('rejected');
    await request(fixture.app).get(`/api/sessions/${result.session.id}`).expect(200);
    const calls = (await request(fixture.app).get('/api/llm-calls').expect(200)).body.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0]).toMatchObject({ purpose: 'plan', mode: 'mock', ok: 1 });
    expect(
      fixture.db
        .prepare("SELECT count(*) AS count FROM audit_log WHERE action='step.reject'")
        .get(),
    ).toEqual({ count: 1 });
  });
});
