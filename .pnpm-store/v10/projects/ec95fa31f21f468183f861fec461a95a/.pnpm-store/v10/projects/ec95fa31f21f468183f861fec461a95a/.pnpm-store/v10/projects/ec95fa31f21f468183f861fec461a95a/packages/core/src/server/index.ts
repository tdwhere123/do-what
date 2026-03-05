import { SESSION_TOKEN_PATH } from '../config.js';
import { startHttpServer } from './http.js';

async function main(): Promise<void> {
  const server = await startHttpServer();
  server.app.log.info(
    {
      host: server.host,
      port: server.port,
      sessionTokenPath: SESSION_TOKEN_PATH,
    },
    'core HTTP server started',
  );
}

void main().catch((error: unknown) => {
  console.error('[core] failed to start server', error);
  process.exit(1);
});
