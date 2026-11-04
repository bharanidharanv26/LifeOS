import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AgentService } from '../src/agent/service.js';
import { seedDemo } from '../src/demo/service.js';
import { createLlmClient } from '../src/llm/client.js';
import { createFixture } from './helpers.js';

describe('local tool execution', () => {
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

  it('runs only approved steps and links local artifacts back to the session', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.');
    const steps = detail.plan?.steps ?? [];
    for (const step of steps) agent.reviewStep(step.id, 'approve');
    const executed = agent.executeSession(detail.session.id);
    expect(executed.execution).toMatchObject({ attempted: 3, succeeded: 3, failed: 0 });
    expect(executed.session.status).toBe('completed');
    expect(executed.plan?.steps.every((step) => step.status === 'executed')).toBe(true);
    expect(fixture.db.prepare('SELECT count(*) AS count FROM calendar_events').get()).toEqual({
      count: 1,
    });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM email_drafts').get()).toEqual({
      count: 1,
    });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM notes').get()).toEqual({ count: 1 });

    const calendar = await request(fixture.app).get('/api/calendar').expect(200);
    expect(calendar.body.events[0]).toMatchObject({
      session_id: detail.session.id,
      step_id: steps.find((step) => step.tool === 'create_calendar_block')?.id,
      session_goal: 'Prepare for my Friday investor call.',
    });
    const drafts = await request(fixture.app).get('/api/drafts').expect(200);
    expect(drafts.body.drafts[0].subject).toContain('investor call');
    const notes = await request(fixture.app).get('/api/notes').expect(200);
    expect(notes.body.notes[0].tags).toEqual(['preparation', 'investor']);
    const audit = await request(fixture.app)
      .get('/api/audit?action=step.executed&limit=10')
      .expect(200);
    expect(audit.body.entries).toHaveLength(3);
    await request(fixture.app)
      .post(`/api/sessions/${detail.session.id}/execute`)
      .send({})
      .expect(409);
  });

  it('leaves unapproved steps alone and supports a second batch', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.');
    const steps = detail.plan?.steps ?? [];
    const note = steps.find((step) => step.tool === 'save_note');
    if (!note) throw new Error('Expected note step');
    for (const step of steps.filter((item) => item.id !== note.id))
      agent.reviewStep(step.id, 'approve');
    const first = agent.executeSession(detail.session.id);
    expect(first.execution).toMatchObject({ attempted: 2, succeeded: 2, failed: 0 });
    expect(agent.getStep(note.id).status).toBe('proposed');
    expect(fixture.db.prepare('SELECT count(*) AS count FROM notes').get()).toEqual({ count: 0 });
    agent.reviewStep(note.id, 'approve');
    const second = agent.executeSession(detail.session.id);
    expect(second.execution).toMatchObject({ attempted: 1, succeeded: 1, failed: 0 });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM notes').get()).toEqual({ count: 1 });
  });

  it('surfaces calendar overlaps as failed steps without rolling back other results', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.');
    const steps = detail.plan?.steps ?? [];
    const block = steps.find((step) => step.tool === 'create_calendar_block');
    const email = steps.find((step) => step.tool === 'draft_email');
    if (!block || !email) throw new Error('Expected prep steps');
    fixture.db
      .prepare('INSERT INTO calendar_events (id,title,start_ts,end_ts,notes) VALUES (?,?,?,?,?)')
      .run(
        'overlap-event',
        'Existing investor sync',
        String(block.args.start),
        String(block.args.end),
        '',
      );
    agent.reviewStep(block.id, 'approve');
    agent.reviewStep(email.id, 'approve');
    const executed = agent.executeSession(detail.session.id);
    expect(executed.execution).toMatchObject({ attempted: 2, succeeded: 1, failed: 1 });
    expect(executed.execution.failures[0]).toMatchObject({
      step_id: block.id,
      code: 'CALENDAR_OVERLAP',
    });
    expect(agent.getStep(block.id).status).toBe('failed');
    expect(agent.getStep(email.id).status).toBe('executed');
    expect(fixture.db.prepare('SELECT count(*) AS count FROM email_drafts').get()).toEqual({
      count: 1,
    });
    expect(fixture.db.prepare('SELECT count(*) AS count FROM calendar_events').get()).toEqual({
      count: 1,
    });
  });

  it('re-checks current preferences immediately before executing', async () => {
    const detail = await agent.createSession('Prepare for my Friday investor call.');
    const block = detail.plan?.steps.find((step) => step.tool === 'create_calendar_block');
    if (!block) throw new Error('Expected block');
    agent.reviewStep(block.id, 'approve');
    fixture.memories.addMemory({
      type: 'preference',
      key: 'no_morning_blocks',
      value: 'Avoid morning blocks; schedule prep at noon or later.',
      source: 'user',
      confidence: 0.9,
    });
    const executed = agent.executeSession(detail.session.id);
    expect(executed.execution).toMatchObject({ attempted: 1, succeeded: 0, failed: 1 });
    expect(executed.execution.failures[0]?.code).toBe('POLICY_CONFLICT');
    expect(fixture.db.prepare('SELECT count(*) AS count FROM calendar_events').get()).toEqual({
      count: 0,
    });
  });
});
