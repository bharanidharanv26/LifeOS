import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function hasProperty<K extends string>(error: unknown, key: K): error is Record<K, unknown> {
  return typeof error === 'object' && error !== null && key in error;
}

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues
          .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
          .join('; '),
      },
    });
    return;
  }
  if (error instanceof AppError) {
    response.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (hasProperty(error, 'type')) {
    if (error.type === 'entity.too.large') {
      response.status(413).json({
        error: { code: 'BODY_TOO_LARGE', message: 'JSON bodies must be smaller than 32 KB.' },
      });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      response
        .status(400)
        .json({ error: { code: 'INVALID_JSON', message: 'The request body must be valid JSON.' } });
      return;
    }
    if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') {
      response
        .status(415)
        .json({ error: { code: 'UNSUPPORTED_ENCODING', message: 'Use uncompressed UTF-8 JSON.' } });
      return;
    }
  }
  if (hasProperty(error, 'code') && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    response.status(409).json({
      error: {
        code: 'CONFLICT',
        message: 'An active memory with this type, key, and value already exists.',
      },
    });
    return;
  }
  if (hasProperty(error, 'code') && error.code === 'SQLITE_BUSY') {
    response.status(503).json({
      error: { code: 'DATABASE_BUSY', message: 'The database is busy. Please retry shortly.' },
    });
    return;
  }
  // Do not serialize arbitrary errors: upstream errors can contain headers, bodies, or keys.
  console.error('[lifeos] Unexpected server error; request details omitted.');
  response.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' },
  });
};
