import { createServer } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { closeDatabase, openDatabase } from './db/index.js';
import { MemoryService } from './memory/service.js';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const memories = new MemoryService(db);
memories.decayUnusedMemories();
const server = createServer(createApp({ db, config }));

const maintenance = setInterval(
  () => {
    try {
      memories.decayUnusedMemories();
    } catch {
      console.error('[lifeos] Memory maintenance failed; it will retry on the next cycle.');
    }
  },
  24 * 60 * 60 * 1000,
);
maintenance.unref();

server.listen(config.port, config.host, () => {
  console.info(`[lifeos] API ready at http://${config.host}:${config.port}`);
  console.info(
    `[lifeos] SQLite connected; model mode ${config.mockMode ? 'MOCK (simulated)' : 'LIVE'}.`,
  );
});

server.on('error', () => {
  console.error(
    '[lifeos] HTTP server failed. Check HOST and PORT, and whether the port is in use.',
  );
  clearInterval(maintenance);
  closeDatabase(db);
  process.exitCode = 1;
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[lifeos] ${signal}: finishing requests and closing SQLite.`);
  clearInterval(maintenance);
  const deadline = setTimeout(() => {
    server.closeAllConnections();
    closeDatabase(db);
    process.exit(1);
  }, 10_000);
  deadline.unref();
  server.close(() => {
    closeDatabase(db);
    clearTimeout(deadline);
    process.exitCode = 0;
  });
  server.closeIdleConnections();
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
