import { Router } from 'express';
import { z } from 'zod';
import type { LifeDatabase } from '../db/index.js';
import { resetDemo, seedDemo } from '../demo/service.js';
import type { Clock } from '../memory/service.js';

const seedBodySchema = z.object({}).strict();
const resetBodySchema = z
  .object({ confirm: z.literal('FORGET EVERYTHING'), reseed: z.boolean().default(false) })
  .strict();

export function demoRouter(db: LifeDatabase, clock: Clock): Router {
  const router = Router();
  router.post('/seed', (request, response) => {
    seedBodySchema.parse(request.body ?? {});
    response.json(seedDemo(db, clock));
  });
  router.post('/reset', (request, response) => {
    const { reseed } = resetBodySchema.parse(request.body);
    response.json(
      db.transaction(() => {
        const result = resetDemo(db);
        return reseed ? { ...result, seed: seedDemo(db, clock) } : result;
      })(),
    );
  });
  return router;
}
