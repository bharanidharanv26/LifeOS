import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LifeDatabase } from '../db/index.js';
import { AppError } from '../errors.js';
import type { LlmClient } from '../llm/client.js';
import { PLAN_PROMPT, UNDERSTAND_PROMPT } from '../llm/prompts.js';
import { nextWeekday } from '../llm/mock.js';
import { MemoryService, type Clock } from '../memory/service.js';
import type { Memory } from '../memory/schemas.js';
import { validateArgs, type ToolName } from '../tools/schemas.js';
import { checkPolicy } from './policy.js';
import {
  planSchema,
  policyWarningSchema,
  stepStatusSchema,
  understandSchema,
  type StoredStep,
} from './schemas.js';

interface SessionRow {
  id: string;
  goal_text: string;
  status: string;
  created_at: string;
  demo_scenario: number;
  learned_json: string | null;
  error_json: string | null;
}
interface PlanRow {
  id: string;
  session_id: string;
  version: number;
  summary: string;
  created_at: string;
  questions_json: string;
  changes_json: string;
  context_json: string;
  mode: 'mock' | 'live' | 'fallback';
}
interface StepRow {
  id: string;
  plan_id: string;
  order_idx: number;
  title: string;
  tool: ToolName;
  args_json: string;
  rationale: string;
  memory_ids_json: string;
  risk: 'low' | 'medium';
  status: string;
  reject_reason: string | null;
  edited_args_json: string | null;
  executed_at: string | null;
  result_json: string | null;
  policy_json: string;
  demo_fixture: number;
}
export interface MemoryChange {
  memory_id: string;
  key: string;
  before: string | null;
  value: string;
  reason: string;
  confidence: number;
}
interface ContextSnapshot {
  memories: Memory[];
}
const parseObject = (text: string): Record<string, unknown> =>
  z.record(z.string(), z.unknown()).parse(JSON.parse(text) as unknown);

export class AgentService {
  readonly memories: MemoryService;
  activeOperations = 0;
  readonly busySessions = new Set<string>();
  constructor(
    readonly db: LifeDatabase,
    readonly llm: LlmClient,
    readonly clock: Clock = () => new Date(),
  ) {
    this.memories = new MemoryService(db, clock);
  }

  audit(
    actor: 'user' | 'agent' | 'system',
    action: string,
    entity: string,
    id: string,
    detail: unknown,
  ): void {
    this.db
      .prepare(
        'INSERT INTO audit_log (id,ts,actor,action,entity,entity_id,detail_json) VALUES (?,?,?,?,?,?,?)',
      )
      .run(
        randomUUID(),
        this.clock().toISOString(),
        actor,
        action,
        entity,
        id,
        JSON.stringify(detail),
      );
  }

  listSessions(): SessionRow[] {
    return this.db
      .prepare<[], SessionRow>('SELECT * FROM sessions ORDER BY rowid DESC LIMIT 100')
      .all();
  }

  getStep(id: string): StoredStep {
    const row = this.db.prepare<[string], StepRow>('SELECT * FROM plan_steps WHERE id = ?').get(id);
    if (!row) throw new AppError(404, 'STEP_NOT_FOUND', 'This step could not be found.');
    return {
      id: row.id,
      plan_id: row.plan_id,
      order_idx: row.order_idx,
      title: row.title,
      tool: row.tool,
      args: validateArgs(row.tool, parseObject(row.args_json)),
      rationale: row.rationale,
      memory_ids: z.array(z.uuid()).parse(JSON.parse(row.memory_ids_json) as unknown),
      risk: row.risk,
      status: stepStatusSchema.parse(row.status),
      reject_reason: row.reject_reason,
      edited_args: row.edited_args_json
        ? validateArgs(row.tool, parseObject(row.edited_args_json))
        : null,
      executed_at: row.executed_at,
      result: row.result_json ? (JSON.parse(row.result_json) as unknown) : null,
      policy_warnings: z.array(policyWarningSchema).parse(JSON.parse(row.policy_json) as unknown),
      demo_fixture: row.demo_fixture === 1,
    };
  }

  getSession(id: string) {
    const session = this.db
      .prepare<[string], SessionRow>('SELECT * FROM sessions WHERE id = ?')
      .get(id);
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'This session could not be found.');
    const row = this.db
      .prepare<[string], PlanRow>(
        'SELECT * FROM plans WHERE session_id = ? ORDER BY version DESC LIMIT 1',
      )
      .get(id);
    const context = row ? (JSON.parse(row.context_json) as ContextSnapshot) : { memories: [] };
    const plan = row
      ? {
          id: row.id,
          version: row.version,
          summary: row.summary,
          created_at: row.created_at,
          mode: row.mode,
          questions_for_user: z.array(z.string()).parse(JSON.parse(row.questions_json) as unknown),
          changed_since_last_time: JSON.parse(row.changes_json) as MemoryChange[],
          steps: this.db
            .prepare<[string], { id: string }>(
              'SELECT id FROM plan_steps WHERE plan_id = ? ORDER BY order_idx',
            )
            .all(row.id)
            .map((step) => this.getStep(step.id)),
        }
      : null;
    return {
      session: {
        id: session.id,
        goal_text: session.goal_text,
        status: session.status,
        created_at: session.created_at,
        demo_scenario: session.demo_scenario === 1,
      },
      plan,
      memories: context.memories,
      learned: session.learned_json ? (JSON.parse(session.learned_json) as unknown) : null,
      error: session.error_json ? (JSON.parse(session.error_json) as unknown) : null,
    };
  }

  async createSession(goal: string, demo = false) {
    const id = randomUUID();
    this.db
      .prepare(
        'INSERT INTO sessions (id,goal_text,status,created_at,demo_scenario) VALUES (?,?,?,?,?)',
      )
      .run(id, goal, 'planning', this.clock().toISOString(), Number(demo));
    this.audit('user', 'session.created', 'session', id, { goal, demo });
    this.activeOperations++;
    this.busySessions.add(id);
    try {
      const now = this.clock().toISOString();
      const understood = await this.llm.chat({
        system: UNDERSTAND_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify({ goal, demo, now }) }],
        jsonSchema: understandSchema,
      });
      const understanding = understandSchema.parse(understood.json);
      const relevant = this.memories.retrieveRelevant(goal, 8, { sessionId: id });
      const mandatory = [
        ...this.memories.list({ type: 'preference', limit: 200 }).memories,
        ...this.memories.list({ type: 'goal', limit: 200 }).memories,
      ];
      const memories = [
        ...new Map([...relevant, ...mandatory].map((memory) => [memory.id, memory])).values(),
      ];
      const calendar = this.db
        .prepare('SELECT * FROM calendar_events WHERE end_ts >= ? ORDER BY start_ts LIMIT 50')
        .all(now);
      const context = {
        goal,
        now,
        demo,
        memories,
        understanding,
        calendar,
        timezone: 'UTC',
        ...(demo
          ? {
              demo_context: {
                fictional: true,
                contact: 'Avery <avery@example.test>',
                prep_date: nextWeekday(now, /board/i.test(goal) ? 2 : 5, /board/i.test(goal))
                  .toISOString()
                  .slice(0, 10),
                duration_minutes: 25,
              },
            }
          : {}),
      };
      const knownIds = new Set(memories.map((memory) => memory.id));
      const schema = planSchema.refine(
        (plan) =>
          plan.steps.every((step) => step.memory_ids.every((memoryId) => knownIds.has(memoryId))),
        { message: 'Cite only memory IDs supplied in context.' },
      );
      const planned = await this.llm.chat({
        system: PLAN_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(context) }],
        jsonSchema: schema,
      });
      const proposal = schema.parse(planned.json);
      const earlyDemo =
        demo &&
        /investor/i.test(goal) &&
        !memories.some((memory) => memory.key === 'no_morning_blocks');
      let fixtureId: string | null = null;
      if (earlyDemo) {
        let prep = proposal.steps.find((step) => step.tool === 'create_calendar_block');
        const start = nextWeekday(now, 5);
        start.setUTCHours(9, 0, 0, 0);
        if (!prep) {
          prep = {
            id: 'guided-demo-prep',
            title: 'Review the deliberately early demo proposal',
            tool: 'create_calendar_block',
            args: {},
            rationale:
              'Guided demo fixture: reject this early block to teach a broader morning preference.',
            memory_ids: memories
              .filter((memory) => memory.key === 'meeting_start_time')
              .map((memory) => memory.id),
            risk: 'medium',
          };
          proposal.steps.unshift(prep);
        }
        prep.args = {
          title: 'Investor call prep',
          start: start.toISOString(),
          end: new Date(start.getTime() + 25 * 60000).toISOString(),
          notes: 'Guided demo fixture: deliberately early; requires correction or rejection.',
        };
        prep.rationale =
          'Guided demo fixture: this intentionally early proposal lets you demonstrate a rejection. The policy checker blocks approval.';
        fixtureId = prep.id;
      }
      const previous = this.db
        .prepare<[], { context_json: string }>(
          'SELECT context_json FROM plans ORDER BY rowid DESC LIMIT 1',
        )
        .get();
      const old = previous ? (JSON.parse(previous.context_json) as ContextSnapshot) : null;
      const cited = new Set(proposal.steps.flatMap((step) => step.memory_ids));
      const changes: MemoryChange[] = old
        ? memories
            .filter(
              (memory) =>
                cited.has(memory.id) &&
                (old.memories.some(
                  (prior) =>
                    prior.id === memory.id &&
                    (prior.value !== memory.value || prior.confidence !== memory.confidence),
                ) ||
                  (!old.memories.some((prior) => prior.id === memory.id) &&
                    memory.source === 'inferred')),
            )
            .map((memory) => ({
              memory_id: memory.id,
              key: memory.key,
              before:
                old.memories.find((prior) => prior.id === memory.id || prior.key === memory.key)
                  ?.value ?? null,
              value: memory.value,
              confidence: memory.confidence,
              reason: memory.rationale,
            }))
        : [];
      this.db.transaction(() => {
        const planId = randomUUID();
        const version =
          (this.db
            .prepare<[], { version: number }>(
              'SELECT coalesce(max(version),0) AS version FROM plans',
            )
            .get()?.version ?? 0) + 1;
        const mode = planned.fallback || understood.fallback ? 'fallback' : planned.mode;
        this.db
          .prepare(
            'INSERT INTO plans (id,session_id,version,summary,created_at,questions_json,changes_json,context_json,mode) VALUES (?,?,?,?,?,?,?,?,?)',
          )
          .run(
            planId,
            id,
            version,
            proposal.summary,
            now,
            JSON.stringify(proposal.questions_for_user),
            JSON.stringify(changes),
            JSON.stringify(context),
            mode,
          );
        proposal.steps.forEach((step, index) => {
          const stepId = randomUUID();
          const warnings = checkPolicy(step, memories);
          this.db
            .prepare(
              'INSERT INTO plan_steps (id,plan_id,order_idx,title,tool,args_json,rationale,memory_ids_json,risk,policy_json,demo_fixture) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
            )
            .run(
              stepId,
              planId,
              index,
              step.title,
              step.tool,
              JSON.stringify(validateArgs(step.tool, step.args)),
              step.rationale,
              JSON.stringify(step.memory_ids),
              step.risk,
              JSON.stringify(warnings),
              Number(step.id === fixtureId),
            );
          this.audit('agent', 'step.proposed', 'step', stepId, {
            title: step.title,
            tool: step.tool,
            warnings,
            demo_fixture: step.id === fixtureId,
          });
        });
        this.db
          .prepare("UPDATE sessions SET status='proposed',understanding_json=? WHERE id=?")
          .run(JSON.stringify(understanding), id);
      })();
      return this.getSession(id);
    } catch (error) {
      const failure =
        error instanceof AppError
          ? error
          : new AppError(500, 'PLANNING_FAILED', 'Planning failed. Please retry.');
      this.db
        .prepare("UPDATE sessions SET status='failed',error_json=? WHERE id=?")
        .run(JSON.stringify({ code: failure.code, message: failure.message }), id);
      this.audit('system', 'session.failed', 'session', id, { code: failure.code });
      throw failure;
    } finally {
      this.activeOperations--;
      this.busySessions.delete(id);
    }
  }

  reviewStep(
    id: string,
    action: 'approve' | 'edit' | 'reject',
    input?: { args?: Record<string, unknown>; reason?: string },
  ): StoredStep {
    return this.db.transaction(() => {
      const step = this.getStep(id);
      const parent = this.db
        .prepare<[string], { session_id: string; status: string }>(
          'SELECT p.session_id,s.status FROM plans p JOIN sessions s ON s.id=p.session_id WHERE p.id=?',
        )
        .get(step.plan_id);
      if (!parent) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found.');
      if (
        this.busySessions.has(parent.session_id) ||
        parent.status === 'reflected' ||
        ['executed', 'failed'].includes(step.status)
      )
        throw new AppError(409, 'STEP_LOCKED', 'This step can no longer be reviewed.');
      const args =
        action === 'edit' ? validateArgs(step.tool, input?.args) : (step.edited_args ?? step.args);
      const warnings = checkPolicy(
        { ...step, args },
        this.memories.list({ type: 'preference', limit: 200 }).memories,
      );
      if (action !== 'reject' && warnings.some((warning) => warning.blocking))
        throw new AppError(
          409,
          'POLICY_CONFLICT',
          'This step conflicts with your preferences. Edit its arguments or reject it.',
        );
      const repaired =
        action === 'edit'
          ? step.policy_warnings
              .filter(
                (warning) => !warnings.some((current) => current.memory_id === warning.memory_id),
              )
              .map((warning) => ({ ...warning, blocking: false, repaired: true }))
          : [];
      const status =
        action === 'approve'
          ? step.edited_args
            ? 'edited'
            : 'approved'
          : action === 'edit'
            ? 'edited'
            : 'rejected';
      this.db
        .prepare(
          'UPDATE plan_steps SET status=?,edited_args_json=?,reject_reason=?,policy_json=? WHERE id=?',
        )
        .run(
          status,
          action === 'edit'
            ? JSON.stringify(args)
            : step.edited_args
              ? JSON.stringify(step.edited_args)
              : null,
          action === 'reject' ? (input?.reason ?? '') : null,
          JSON.stringify([...warnings, ...repaired]),
          id,
        );
      this.db.prepare("UPDATE sessions SET status='reviewing' WHERE id=?").run(parent.session_id);
      this.audit('user', `step.${action}`, 'step', id, {
        before: step.edited_args ?? step.args,
        after: args,
        reason: input?.reason ?? null,
      });
      return this.getStep(id);
    })();
  }
}
