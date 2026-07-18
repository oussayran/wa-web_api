import 'dotenv/config';
import { buildApp } from './app.js';
import { loadConfig } from './config/env.js';

const config = loadConfig();
const app = await buildApp({ config });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'Shutting down');
  await app.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.fatal({ err: error }, 'API startup failed');
  process.exit(1);
}
