import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentService } from '../src/agent/service.js';
import { seedDemo } from '../src/demo/service.js';
import { createLlmClient } from '../src/llm/client.js';
import { createFixture } from './helpers.js';

describe('reflection and learning', () => {
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

  it('turns a rejection and an edit into memories that reshape the next plan', async () => {
    const first = await agent.createSession('Prepare for my Friday investor call.', true);
    const early = first.plan?.steps.find((step) => step.demo_fixture);
    const email = first.plan?.steps.find((step) => step.tool === 'draft_email');
    if (!early || !email) throw new Error('Expected demo steps');
    agent.reviewStep(early.id, 'reject', { reason: 'too early for me' });
    const editedBody = 'Hi Avery,\n\nTighter agenda:\n- One decision\n\nThanks!';
    agent.reviewStep(email.id, 'edit', { args: { ...email.args, body: editedBody } });
    const reflected = await agent.reflect(first.session.id);
    expect(reflected.session.status).toBe('reflected');
    expect(reflected.reflection.new_memories.map((memory) => memory.key)).toEqual(
      expect.arrayContaining(['no_morning_blocks', 'email_style']),
    );
    expect(reflected.reflection.insights.length).toBeGreaterThan(0);
    const learnedMemory = fixture.memories
      .list()
      .memories.find((memory) => memory.key === 'no_morning_blocks');
    expect(learnedMemory).toMatchObject({ source: 'inferred', confidence: 0.8 });
    const event = fixture.db
      .prepare(
        "SELECT session_id FROM memory_events WHERE event='created' AND session_id=? AND memory_id=?",
      )
      .get(first.session.id, learnedMemory?.id);
    expect(event).toBeDefined();

    const second = await agent.createSession("Get ready for next week's board meeting.", true);
    const block = second.plan?.steps.find((step) => step.tool === 'create_calendar_block');
    const draft = second.plan?.steps.find((step) => step.tool === 'draft_email');
    expect(new Date(String(block?.args.start)).getUTCHours()).toBe(12);
    expect(String(draft?.args.body)).toContain('Tighter agenda');
    expect(second.plan?.changed_since_last_time.map((change) => change.key)).toEqual(
      expect.arrayContaining(['no_morning_blocks', 'email_style']),
    );
    expect(agent.getStep(early.id).status).toBe('rejected');
  });

  it('reinforces approved memories and refuses to reflect twice', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.', true);
    const email = detail.plan?.steps.find((step) => step.tool === 'draft_email');
    if (!email) throw new Error('Expected email');
    agent.reviewStep(email.id, 'approve');
    const reflected = await agent.reflect(detail.session.id);
    expect(reflected.reflection.reinforced.length).toBeGreaterThan(0);
    await request(fixture.app)
      .post(`/api/sessions/${detail.session.id}/reflect`)
      .send({})
      .expect(409);
  });

  it('requires at least one review and validates the request', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.', true);
    await request(fixture.app)
      .post(`/api/sessions/${detail.session.id}/reflect`)
      .send({})
      .expect(409);
    const step = detail.plan?.steps[0];
    if (!step) throw new Error('Expected step');
    agent.reviewStep(step.id, 'reject', { reason: 'not useful' });
    await request(fixture.app)
      .post(`/api/sessions/${detail.session.id}/reflect`)
      .send({ extra: true })
      .expect(400);
    const reflected = await request(fixture.app)
      .post(`/api/sessions/${detail.session.id}/reflect`)
      .send({})
      .expect(200);
    expect(reflected.body.session.status).toBe('reflected');
    expect(reflected.body.reflection).toBeDefined();
  });
});
