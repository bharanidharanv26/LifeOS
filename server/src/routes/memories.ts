import { Router } from 'express';
import { z } from 'zod';
import {
  addMemorySchema,
  editMemorySchema,
  listMemoriesSchema,
  memoryIdSchema,
  retrieveMemoriesSchema,
} from '../memory/schemas.js';
import type { MemoryService } from '../memory/service.js';

const historyQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
const emptyBodySchema = z.object({}).strict();

export function memoriesRouter(memories: MemoryService): Router {
  const router = Router();
  router.get('/', (request, response) => {
    response.json(memories.list(listMemoriesSchema.parse(request.query)));
  });
  router.post('/', (request, response) => {
    const input = addMemorySchema.parse(request.body);
    response.status(201).json({ memory: memories.addMemory(input, { actor: 'user' }) });
  });
  router.post('/retrieve', (request, response) => {
    const input = retrieveMemoriesSchema.parse(request.body);
    response.json({
      memories: memories.retrieveRelevant(input.query, input.k, {
        actor: 'user',
        reason: 'Memory retrieval preview requested by the user.',
      }),
    });
  });
  router.get('/:id/history', (request, response) => {
    const id = memoryIdSchema.parse(request.params.id);
    const query = historyQuerySchema.parse(request.query);
    response.json({ events: memories.history(id, query.limit, query.offset) });
  });
  router.get('/:id', (request, response) => {
    response.json({ memory: memories.getMemory(memoryIdSchema.parse(request.params.id)) });
  });
  router.patch('/:id', (request, response) => {
    const id = memoryIdSchema.parse(request.params.id);
    response.json({ memory: memories.edit(id, editMemorySchema.parse(request.body)) });
  });
  router.delete('/:id', (request, response) => {
    emptyBodySchema.parse(request.body ?? {});
    const id = memoryIdSchema.parse(request.params.id);
    memories.delete(id);
    response.json({ deleted: true, id });
  });
  return router;
}
