import { buildServer } from './server.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildServer();

  try {
    const port = Number(process.env.PORT) || env.SERVER_PORT;
    await app.listen({ port, host: env.HOST });
    app.log.info(`kairo-api listening on http://${env.HOST}:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

void main();
