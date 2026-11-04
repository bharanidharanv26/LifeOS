import { z } from 'zod';
import { earliestHour } from '../agent/policy.js';

const contextSchema = z.object({
  goal: z.string().default(''),
  now: z.string().default('2026-11-04T12:00:00.000Z'),
  demo: z.boolean().default(false),
  memories: z
    .array(
      z.object({
        id: z.string(),
        key: z.string(),
        value: z.string(),
        source: z.string(),
        confidence: z.number(),
      }),
    )
    .default([]),
  reviews: z
    .array(
      z.object({
        id: z.string(),
        tool: z.string(),
        status: z.string(),
        reject_reason: z.string().nullable(),
        args: z.record(z.string(), z.unknown()),
        original_args: z.record(z.string(), z.unknown()),
        memory_ids: z.array(z.string()),
      }),
    )
    .default([]),
});

export function nextWeekday(now: string, day: number, nextWeek = false): Date {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  if (nextWeek)
    date.setUTCDate(date.getUTCDate() + (8 - (date.getUTCDay() || 7)) + ((day + 6) % 7));
  else date.setUTCDate(date.getUTCDate() + ((day - date.getUTCDay() + 7) % 7 || 7));
  return date;
}

export function mockOutput(purpose: string, payload: unknown): unknown {
  const context = contextSchema.parse(payload);
  const { goal, memories, demo, now } = context;
  const board = /board/i.test(goal);
  if (purpose === 'understand')
    return {
      intent: /meeting|call|prepare|ready/i.test(goal)
        ? 'meeting_preparation'
        : /email|draft/i.test(goal)
          ? 'writing'
          : /search|find/i.test(goal)
            ? 'search'
            : /note|save/i.test(goal)
              ? 'note'
              : 'general',
      entities: board ? ['board meeting'] : /investor/i.test(goal) ? ['investor call'] : [],
      dates: /friday/i.test(goal) ? ['Friday'] : /next week/i.test(goal) ? ['next week'] : [],
      missing_info: demo ? [] : ['Confirm the participants and meeting details.'],
    };
  if (purpose === 'reflect') {
    const reviewed = context.reviews;
    const early = reviewed.find(
      (step) =>
        step.status === 'rejected' &&
        /too early|morning/i.test(step.reject_reason ?? '') &&
        step.tool === 'create_calendar_block',
    );
    const edited = reviewed.find(
      (step) =>
        step.tool === 'draft_email' &&
        step.status !== 'rejected' &&
        step.args.body !== step.original_args.body,
    );
    const newMemories = [];
    if (early)
      newMemories.push({
        type: 'preference',
        key: 'no_morning_blocks',
        value: 'Avoid morning blocks; schedule prep at noon or later.',
        rationale: `You rejected “${String(early.original_args.title)}” because “${early.reject_reason}”.`,
        confidence: 0.8,
        contradicts_ids: [],
        evidence_step_ids: [early.id],
      });
    if (edited)
      newMemories.push({
        type: 'preference',
        key: 'email_style',
        value: `Use the edited email structure and wording as a style example:\n${String(edited.args.body).slice(0, 3000)}`,
        rationale:
          'Learned from your email edit, keeping your chosen greeting, bullets, and closing.',
        confidence: 0.8,
        contradicts_ids: memories
          .filter((memory) => memory.key === 'email_style')
          .map((memory) => memory.id),
        evidence_step_ids: [edited.id],
      });
    const contradicted = new Set(newMemories.flatMap((memory) => memory.contradicts_ids));
    return {
      new_memories: newMemories,
      reinforced_ids: [
        ...new Set(
          reviewed
            .filter(
              (step) =>
                ['approved', 'executed'].includes(step.status) &&
                step.args.body === step.original_args.body,
            )
            .flatMap((step) => step.memory_ids),
        ),
      ].filter((id) => !contradicted.has(id)),
      weakened_ids: [],
      insights: newMemories.length
        ? ['Your review changed the context that will shape your next plan.']
        : ['Your reviewed choices confirmed the existing context.'],
    };
  }
  if (purpose !== 'plan') return { message: 'Offline mock response.' };
  const topic = board ? 'board meeting' : 'investor call';
  const ids = (pattern: RegExp) =>
    memories
      .filter((memory) => pattern.test(`${memory.key} ${memory.value}`))
      .map((memory) => memory.id);
  const style = memories
    .filter((memory) => memory.key === 'email_style')
    .sort((a, b) => b.confidence - a.confidence)[0];
  const learnedBody = style?.value.split('style example:\n')[1];
  const body = learnedBody
    ? learnedBody
        .replace(/investor call/gi, topic)
        .replace(/investor update/gi, board ? 'board update' : 'investor update')
    : `Hi ${demo ? 'Avery' : 'there'},\n\n- Progress since our last update\n- Key metrics and decisions\n- Open questions for our ${topic}\n\nThanks!`;
  if (/search|find.*note/i.test(goal))
    return {
      summary: 'Search your local notes for relevant context.',
      steps: [
        {
          id: 'search',
          title: 'Find relevant notes',
          tool: 'search_notes',
          args: { query: goal.replace(/search|find|notes/gi, '').trim() || 'meeting' },
          rationale: 'Read existing local context before doing more work.',
          memory_ids: [],
          risk: 'low',
        },
      ],
      questions_for_user: [],
    };
  if (!/meeting|call|prepare|ready|email|draft/i.test(goal))
    return {
      summary: 'Capture your goal so you can refine it.',
      steps: [
        {
          id: 'note',
          title: 'Save the goal',
          tool: 'save_note',
          args: { title: goal.slice(0, 100), body: goal, tags: ['goal'] },
          rationale: 'Preserve your intent without guessing actions.',
          memory_ids: [],
          risk: 'low',
        },
      ],
      questions_for_user: ['What outcome and deadline would you like?'],
    };
  const start = nextWeekday(now, board ? 2 : 5, board);
  const minHour = Math.max(
    9,
    ...memories
      .filter((memory) => memory.confidence >= 0.7)
      .map((memory) => earliestHour(memory) ?? 0),
  );
  start.setUTCHours(Math.floor(minHour), Math.round((minHour % 1) * 60), 0, 0);
  if (
    start.getUTCDay() === 5 &&
    minHour >= 12 &&
    memories.some((memory) => /friday.*focus/i.test(`${memory.key} ${memory.value}`))
  )
    start.setUTCDate(start.getUTCDate() - 1);
  const duration = Number(
    /\d+/.exec(
      memories.find((memory) => memory.key === 'prep_duration_minutes')?.value ?? '',
    )?.[0] ?? 25,
  );
  const steps = [];
  if (demo || /friday/i.test(goal))
    steps.push({
      id: 'prep',
      title: `Prepare for your ${topic}`,
      tool: 'create_calendar_block',
      args: {
        title: `${board ? 'Board' : 'Investor'} call prep`,
        start: start.toISOString(),
        end: new Date(start.getTime() + duration * 60000).toISOString(),
        notes:
          'Review metrics, decisions, and open questions. Suggested prep time, not the meeting itself.',
      },
      rationale: 'A focused prep block follows your scheduling and duration preferences.',
      memory_ids: ids(/meeting|morning|prep|friday/i),
      risk: 'low',
    });
  steps.push({
    id: 'email',
    title: 'Draft a concise agenda',
    tool: 'draft_email',
    args: { to: demo ? 'avery@example.test' : '', subject: `Agenda for our ${topic}`, body },
    rationale: learnedBody
      ? 'Uses the email style you taught me in your last review.'
      : 'Short bullets make the agenda easy to scan.',
    memory_ids: style ? [style.id] : [],
    risk: 'low',
  });
  steps.push({
    id: 'note',
    title: 'Keep a preparation checklist',
    tool: 'save_note',
    args: {
      title: `${board ? 'Board' : 'Investor'} preparation`,
      body: `- Review latest metrics\n- Collect decisions\n- Capture open questions\n\nGoal: ${goal}`,
      tags: ['preparation', board ? 'board' : 'investor'],
    },
    rationale: 'Keep reusable context in your local workspace.',
    memory_ids: ids(/investor_update_day/),
    risk: 'low',
  });
  return {
    summary: `A focused prep plan for your ${topic}, shaped by what I know about you.`,
    steps,
    questions_for_user: demo
      ? []
      : [
          'Who should receive the agenda draft?',
          ...(!/friday/i.test(goal)
            ? ['Which day is the meeting? I have not guessed a calendar date.']
            : []),
        ],
  };
}
