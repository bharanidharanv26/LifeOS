import { createApp } from '../src/app.js';
import { parseConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/index.js';
import { MemoryService } from '../src/memory/service.js';

export function createFixture(environment: Record<string, string | undefined> = {}) {
  const config = parseConfig({ NODE_ENV: 'test', DATABASE_PATH: ':memory:', ...environment });
  const db = openDatabase(':memory:');
  let now = new Date('2026-11-04T12:00:00.000Z');
  const clock = () => new Date(now);
  return {
    db,
    config,
    clock,
    memories: new MemoryService(db, clock),
    app: createApp({ db, config, clock }),
    setTime: (value: string) => {
      now = new Date(value);
    },
    close: () => closeDatabase(db),
  };
}
