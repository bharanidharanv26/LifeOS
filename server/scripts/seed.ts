import { loadConfig } from '../src/config.js';
import { closeDatabase, openDatabase } from '../src/db/index.js';
import { seedDemo } from '../src/demo/service.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
try {
  const result = seedDemo(db);
  console.info(
    `LifeOS demo ready: ${result.inserted} added, ${result.skipped} already present, ${result.total} active memories.`,
  );
} finally {
  closeDatabase(db);
}
