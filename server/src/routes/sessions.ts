import { Router } from 'express';
import { z } from 'zod';
import type { AgentService } from '../agent/service.js';

const goalSchema = z
  .object({ goal: z.string().trim().min(3).max(2000), demo: z.boolean().default(false) })
  .strict();
export const emptyBodySchema = z.object({}).strict();
export function sessionsRouter(agent: AgentService): Router {
  const router = Router();
  router.get('/', (_request, response) => response.json({ sessions: agent.listSessions() }));
  router.post('/', async (request, response) => {
    const body = goalSchema.parse(request.body);
    response.status(201).json(await agent.createSession(body.goal, body.demo));
  });
  router.get('/:id', (request, response) =>
    response.json(agent.getSession(z.uuid().parse(request.params.id))),
  );
  router.post('/:id/execute', (request, response) => {
    emptyBodySchema.parse(request.body ?? {});
    response.json(agent.executeSession(z.uuid().parse(request.params.id)));
  });
  return router;
}
export function stepsRouter(agent: AgentService): Router {
  const router = Router();
  router.post('/:id/approve', (request, response) => {
    emptyBodySchema.parse(request.body ?? {});
    response.json({ step: agent.reviewStep(z.uuid().parse(request.params.id), 'approve') });
  });
  router.post('/:id/edit', (request, response) => {
    const body = z
      .object({ args: z.record(z.string(), z.unknown()) })
      .strict()
      .parse(request.body);
    response.json({ step: agent.reviewStep(z.uuid().parse(request.params.id), 'edit', body) });
  });
  router.post('/:id/reject', (request, response) => {
    const body = z
      .object({ reason: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(request.body);
    response.json({ step: agent.reviewStep(z.uuid().parse(request.params.id), 'reject', body) });
  });
  return router;
}
