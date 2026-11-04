import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Config } from './config.js';
import type { LifeDatabase } from './db/index.js';
import { AppError, errorHandler } from './errors.js';
import { MemoryService, type Clock } from './memory/service.js';
import { demoRouter } from './routes/demo.js';
import { healthRouter } from './routes/health.js';
import { memoriesRouter } from './routes/memories.js';
import { createLlmClient } from './llm/client.js';
import { createEmbedder } from './memory/embeddings.js';
import { AgentService } from './agent/service.js';
import { sessionsRouter, stepsRouter } from './routes/sessions.js';
import { auditRouter, calendarRouter, draftsRouter, notesRouter } from './routes/library.js';

export interface AppDependencies {
  db: LifeDatabase;
  config: Config;
  clock?: Clock;
}

export function createApp({
  db,
  config,
  clock = () => new Date(),
}: AppDependencies): express.Express {
  const app = express();
  const memories = new MemoryService(db, clock);
  const agent = new AgentService(db, createLlmClient(db, config), clock, createEmbedder(config));
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || config.clientOrigins.includes(origin)) callback(null, true);
        else
          callback(new AppError(403, 'ORIGIN_NOT_ALLOWED', 'This browser origin is not allowed.'));
      },
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type'],
    }),
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: config.rateLimitMax,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: {
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please try again in a minute.',
        },
      },
    }),
  );
  app.use((request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    const hasBody =
      Number(request.headers['content-length'] ?? 0) > 0 ||
      Boolean(request.headers['transfer-encoding']);
    if (hasBody && !request.is('application/json')) {
      next(
        new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Request bodies must use application/json.'),
      );
      return;
    }
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true, inflate: false }));
  app.use('/api/health', healthRouter(db, config));
  app.use('/api/memories', memoriesRouter(memories));
  app.use('/api/demo', demoRouter(db, clock));
  app.use('/api/sessions', sessionsRouter(agent));
  app.use('/api/steps', stepsRouter(agent));
  app.use('/api/calendar', calendarRouter(db));
  app.use('/api/notes', notesRouter(db));
  app.use('/api/drafts', draftsRouter(db));
  app.use('/api/audit', auditRouter(db));
  app.get('/api/llm-calls', (_request, response) =>
    response.json({
      calls: db.prepare('SELECT * FROM llm_calls ORDER BY rowid DESC LIMIT 100').all(),
    }),
  );
  app.get('/api/export', (_request, response) => {
    const all = (table: string) => db.prepare(`SELECT * FROM ${table}`).all();
    response.setHeader('Content-Disposition', 'attachment; filename="lifeos-export.json"');
    response.json({
      app: 'LifeOS',
      export_version: 1,
      exported_at: clock().toISOString(),
      memories: all('memories'),
      memory_events: all('memory_events'),
      sessions: all('sessions'),
      plans: all('plans'),
      plan_steps: all('plan_steps'),
      calendar_events: all('calendar_events'),
      notes: all('notes'),
      email_drafts: all('email_drafts'),
      audit_log: all('audit_log'),
      llm_calls: all('llm_calls'),
    });
  });
  app.use((_request, _response, next) =>
    next(new AppError(404, 'NOT_FOUND', 'This API route does not exist.')),
  );
  app.use(errorHandler);
  return app;
}
