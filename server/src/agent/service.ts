import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LifeDatabase } from '../db/index.js';
import { AppError } from '../errors.js';
import type { LlmClient } from '../llm/client.js';
import { PLAN_PROMPT, REFLECT_PROMPT, UNDERSTAND_PROMPT } from '../llm/prompts.js';
import { nextWeekday } from '../llm/mock.js';
import type { Embedder } from '../memory/embeddings.js';
import { MemoryService, type Clock } from '../memory/service.js';
import type { Memory } from '../memory/schemas.js';
import { validateArgs, type ToolName } from '../tools/schemas.js';
import { runTool } from '../tools/execute.js';
import { checkPolicy } from './policy.js';
import {
  planSchema,
  policyWarningSchema,
  stepStatusSchema,
  reflectionSchema,
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
export interface LearnedPayload {
  new_memories: (Memory & { evidence_step_ids: string[] })[];
  reinforced: {
    id: string;
    key: string;
    value: string;
    confidence_before: number;
    confidence_after: number;
  }[];
  weakened: {
    id: string;
    key: string;
    value: string;
    confidence_before: number;
    confidence_after: number;
    archived: boolean;
  }[];
  insights: string[];
  reviewed_steps: number;
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
    readonly embedder: Embedder | null = null,
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
      const relevant = await this.memories.retrieveRelevantHybrid(goal, 8, this.embedder, {
        sessionId: id,
      });
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

  async reflect(id: string) {
    const session = this.db
      .prepare<[string], { id: string; goal_text: string; status: string }>(
        'SELECT id,goal_text,status FROM sessions WHERE id=?',
      )
      .get(id);
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'This session could not be found.');
    if (this.busySessions.has(id) || session.status === 'planning')
      throw new AppError(409, 'SESSION_BUSY', 'Wait for this session to finish planning.');
    if (session.status === 'reflected')
      throw new AppError(409, 'ALREADY_REFLECTED', 'This session has already been reflected on.');
    const plan = this.db
      .prepare<[string], { id: string }>(
        'SELECT id FROM plans WHERE session_id=? ORDER BY version DESC LIMIT 1',
      )
      .get(id);
    if (!plan) throw new AppError(409, 'NO_PLAN', 'This session has no plan to reflect on.');
    const steps = this.db
      .prepare<[string], { id: string }>(
        'SELECT id FROM plan_steps WHERE plan_id=? ORDER BY order_idx',
      )
      .all(plan.id)
      .map((step) => this.getStep(step.id));
    const reviewed = steps.filter((step) => step.status !== 'proposed');
    if (reviewed.length === 0)
      throw new AppError(
        409,
        'NOTHING_TO_REFLECT',
        'Approve, edit, or reject at least one step before reflecting.',
      );
    const reviewedIds = new Set(reviewed.map((step) => step.id));
    const memories = this.memories.list({ limit: 200 }).memories;
    const memoryIds = new Set(memories.map((memory) => memory.id));
    const context = {
      goal: session.goal_text,
      now: this.clock().toISOString(),
      reviews: reviewed.map((step) => ({
        id: step.id,
        title: step.title,
        tool: step.tool,
        status: step.status,
        reject_reason: step.reject_reason,
        args: step.edited_args ?? step.args,
        original_args: step.args,
        memory_ids: step.memory_ids,
        result: step.result,
      })),
      memories: memories.map((memory) => ({
        id: memory.id,
        type: memory.type,
        key: memory.key,
        value: memory.value,
        confidence: memory.confidence,
        source: memory.source,
      })),
    };
    const learnedSchema = reflectionSchema
      .refine(
        (payload) =>
          payload.new_memories.every((memory) =>
            memory.evidence_step_ids.every((stepId) => reviewedIds.has(stepId)),
          ),
        { message: 'Evidence must reference reviewed steps in this session.' },
      )
      .refine(
        (payload) =>
          payload.new_memories.every((memory) =>
            memory.contradicts_ids.every((memoryId) => memoryIds.has(memoryId)),
          ) &&
          payload.reinforced_ids.every((memoryId) => memoryIds.has(memoryId)) &&
          payload.weakened_ids.every((memoryId) => memoryIds.has(memoryId)),
        { message: 'Memory IDs must come from the supplied context.' },
      );
    const reflected = await this.llm.chat({
      system: REFLECT_PROMPT,
      messages: [{ role: 'user', content: JSON.stringify(context) }],
      jsonSchema: learnedSchema,
    });
    const payload = learnedSchema.parse(reflected.json);
    const learned = this.db.transaction((): LearnedPayload => {
      const reason = `Learned from your review of “${session.goal_text}”.`;
      const memoryContext = { actor: 'agent' as const, sessionId: id, reason };
      const byId = new Map(memories.map((memory) => [memory.id, memory]));
      const contradicted = new Set(
        payload.new_memories.flatMap((memory) => memory.contradicts_ids),
      );
      const created: (Memory & { evidence_step_ids: string[] })[] = [];
      for (const candidate of payload.new_memories) {
        for (const existingId of candidate.contradicts_ids) {
          const existing = byId.get(existingId);
          if (existing && (existing.type !== candidate.type || existing.key !== candidate.key))
            this.memories.weaken(existingId, memoryContext);
        }
        const memory = this.memories.upsertMemory(
          {
            type: candidate.type,
            key: candidate.key,
            value: candidate.value,
            rationale: candidate.rationale,
            confidence: candidate.confidence,
            source: 'inferred',
          },
          memoryContext,
        );
        created.push({ ...memory, evidence_step_ids: candidate.evidence_step_ids });
      }
      const reinforced = [...new Set(payload.reinforced_ids)].map((memoryId) => {
        const before = byId.get(memoryId);
        const after = this.memories.reinforce(memoryId, memoryContext);
        return {
          id: after.id,
          key: after.key,
          value: after.value,
          confidence_before: before?.confidence ?? after.confidence,
          confidence_after: after.confidence,
        };
      });
      for (const memoryId of new Set(payload.weakened_ids)) {
        if (!contradicted.has(memoryId) && !payload.reinforced_ids.includes(memoryId))
          this.memories.weaken(memoryId, memoryContext);
      }
      // Include automatic same-key contradictions from upsertMemory in the visible diff.
      // Read their final values rather than weakening them a second time.
      const weakened = memories.flatMap((before) => {
        const after = this.memories.getMemory(before.id);
        return after.confidence < before.confidence
          ? [
              {
                id: after.id,
                key: after.key,
                value: after.value,
                confidence_before: before.confidence,
                confidence_after: after.confidence,
                archived: after.archived,
              },
            ]
          : [];
      });
      const result: LearnedPayload = {
        new_memories: created,
        reinforced,
        weakened,
        insights: payload.insights,
        reviewed_steps: reviewed.length,
      };
      this.db
        .prepare("UPDATE sessions SET status='reflected',learned_json=? WHERE id=?")
        .run(JSON.stringify(result), id);
      this.audit('agent', 'session.reflected', 'session', id, {
        created: created.length,
        reinforced: reinforced.length,
        weakened: weakened.length,
        reviewed: reviewed.length,
      });
      return result;
    })();
    return { ...this.getSession(id), reflection: learned };
  }

  executeSession(id: string) {
    const row = this.db
      .prepare<[string], { id: string; status: string }>(
        'SELECT id,status FROM sessions WHERE id=?',
      )
      .get(id);
    if (!row) throw new AppError(404, 'SESSION_NOT_FOUND', 'This session could not be found.');
    if (row.status === 'planning' || this.busySessions.has(id))
      throw new AppError(409, 'SESSION_BUSY', 'This session is still being planned.');
    if (row.status === 'reflected')
      throw new AppError(409, 'SESSION_LOCKED', 'A reflected session can no longer run actions.');
    const plan = this.db
      .prepare<[string], { id: string }>(
        'SELECT id FROM plans WHERE session_id=? ORDER BY version DESC LIMIT 1',
      )
      .get(id);
    if (!plan) throw new AppError(409, 'NO_PLAN', 'This session has no plan to run.');
    const steps = this.db
      .prepare<[string], { id: string }>(
        'SELECT id FROM plan_steps WHERE plan_id=? ORDER BY order_idx',
      )
      .all(plan.id)
      .map((step) => this.getStep(step.id));
    const eligible = steps.filter((step) => step.status === 'approved' || step.status === 'edited');
    if (eligible.length === 0)
      throw new AppError(
        409,
        'NOTHING_TO_RUN',
        'Approve at least one safe step before running this plan.',
      );
    this.db.prepare("UPDATE sessions SET status='executing' WHERE id=?").run(id);
    this.audit('user', 'session.execute', 'session', id, {
      attempted: eligible.map((step) => step.id),
    });
    const preferences = this.memories.list({ type: 'preference', limit: 200 }).memories;
    let succeeded = 0;
    const failures: { step_id: string; code: string; message: string }[] = [];
    for (const step of eligible) {
      const now = this.clock().toISOString();
      const args = step.edited_args ?? step.args;
      const warnings = checkPolicy({ ...step, args }, preferences);
      const blocking = warnings.filter((warning) => warning.blocking);
      if (blocking.length > 0) {
        const message = 'This step now conflicts with your current preferences.';
        this.db
          .prepare(
            "UPDATE plan_steps SET status='failed',executed_at=?,result_json=?,policy_json=? WHERE id=?",
          )
          .run(
            now,
            JSON.stringify({ error: { code: 'POLICY_CONFLICT', message }, simulated: true }),
            JSON.stringify(warnings),
            step.id,
          );
        this.audit('system', 'step.failed', 'step', step.id, {
          code: 'POLICY_CONFLICT',
          warnings: blocking,
        });
        failures.push({ step_id: step.id, code: 'POLICY_CONFLICT', message });
        continue;
      }
      try {
        const result = this.db.transaction(() => {
          const output = runTool(this.db, step.tool, args, step.id);
          this.db
            .prepare(
              "UPDATE plan_steps SET status='executed',executed_at=?,result_json=? WHERE id=?",
            )
            .run(now, JSON.stringify(output), step.id);
          return output;
        })();
        this.audit('user', 'step.executed', 'step', step.id, {
          tool: step.tool,
          result,
        });
        succeeded += 1;
      } catch (error) {
        const failure =
          error instanceof AppError
            ? error
            : new AppError(500, 'EXECUTION_FAILED', 'This local action could not be completed.');
        this.db
          .prepare("UPDATE plan_steps SET status='failed',executed_at=?,result_json=? WHERE id=?")
          .run(
            now,
            JSON.stringify({
              error: { code: failure.code, message: failure.message },
              simulated: true,
            }),
            step.id,
          );
        this.audit('system', 'step.failed', 'step', step.id, {
          code: failure.code,
          message: failure.message,
        });
        failures.push({ step_id: step.id, code: failure.code, message: failure.message });
      }
    }
    this.db.prepare("UPDATE sessions SET status='completed' WHERE id=?").run(id);
    this.audit('system', 'session.executed', 'session', id, {
      attempted: eligible.length,
      succeeded,
      failed: failures.length,
    });
    return {
      ...this.getSession(id),
      execution: { attempted: eligible.length, succeeded, failed: failures.length, failures },
    };
  }
}
