import { Router } from 'express';
import type { Config } from '../config.js';
import type { LifeDatabase } from '../db/index.js';

export function healthRouter(db: LifeDatabase, config: Config): Router {
  const router = Router();
  router.get('/', (_request, response) => {
    db.prepare('SELECT 1').get();
    response.json({
      status: 'ok',
      app: 'LifeOS',
      phase: 8,
      database: 'connected',
      mockMode: config.mockMode,
      model: config.modelName,
      modelIntegration: 'available',
      mockFallback: config.mockFallback,
      retrieval: config.embeddingsEnabled ? 'hybrid' : 'keyword',
      embeddingsConfigured:
        config.embeddingsEnabled &&
        Boolean(config.embeddingsApiKey) &&
        !config.embeddingsBaseUrl.includes('api.example.com'),
      timezone: 'UTC',
    });
  });
  return router;
}
