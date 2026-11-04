import { z } from 'zod';
import { toolArgsSchemas, toolNames } from '../tools/schemas.js';
import { memoryTypes } from '../memory/schemas.js';

export const understandSchema = z
  .object({
    intent: z.enum(['meeting_preparation', 'writing', 'note', 'search', 'general']),
    entities: z.array(z.string().max(300)).max(20),
    dates: z.array(z.string().max(100)).max(10),
    missing_info: z.array(z.string().max(500)).max(10),
  })
  .strict();
export const proposedStepSchema = z
  .object({
    id: z.string().min(1).max(100),
    title: z.string().min(1).max(300),
    tool: z.enum(toolNames),
    args: z.record(z.string(), z.unknown()),
    rationale: z.string().min(1).max(2000),
    memory_ids: z.array(z.uuid()).max(30),
    risk: z.enum(['low', 'medium']),
  })
  .strict()
  .superRefine((step, ctx) => {
    const result = toolArgsSchemas[step.tool].safeParse(step.args);
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({ code: 'custom', path: ['args', ...issue.path], message: issue.message });
  });
export const planSchema = z
  .object({
    summary: z.string().min(1).max(3000),
    steps: z.array(proposedStepSchema).max(8),
    questions_for_user: z.array(z.string().min(1).max(500)).max(10),
  })
  .strict()
  .refine((plan) => new Set(plan.steps.map((step) => step.id)).size === plan.steps.length, {
    message: 'Step IDs must be unique.',
  });
export const reflectionSchema = z
  .object({
    new_memories: z
      .array(
        z
          .object({
            type: z.enum(memoryTypes),
            key: z.string().min(1).max(120),
            value: z.string().min(1).max(4000),
            rationale: z.string().min(1).max(4000),
            confidence: z.number().min(0).max(0.98),
            contradicts_ids: z.array(z.uuid()).max(20),
            evidence_step_ids: z.array(z.uuid()).min(1).max(8),
          })
          .strict(),
      )
      .max(12),
    reinforced_ids: z.array(z.uuid()).max(30),
    weakened_ids: z.array(z.uuid()).max(30),
    insights: z.array(z.string().min(1).max(2000)).max(12),
  })
  .strict();
export type ProposedStep = z.infer<typeof proposedStepSchema>;
export type ProposedPlan = z.infer<typeof planSchema>;
export const policyWarningSchema = z.object({
  memory_id: z.string(),
  message: z.string(),
  repaired: z.boolean(),
  blocking: z.boolean(),
});
export type PolicyWarning = z.infer<typeof policyWarningSchema>;
export const stepStatusSchema = z.enum([
  'proposed',
  'approved',
  'edited',
  'rejected',
  'executed',
  'failed',
]);
export type StepStatus = z.infer<typeof stepStatusSchema>;
export interface StoredStep extends ProposedStep {
  plan_id: string;
  order_idx: number;
  status: StepStatus;
  reject_reason: string | null;
  edited_args: Record<string, unknown> | null;
  result: unknown;
  executed_at: string | null;
  policy_warnings: PolicyWarning[];
  demo_fixture: boolean;
}
