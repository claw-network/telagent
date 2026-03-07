import { loadConfigFromEnv } from './config.js';
import { killStaleTelagentOnPort } from './clawnet/clawnetd-process.js';
import { createLogger } from './logger.js';
import { TelagentNode } from './app.js';

async function main(): Promise<void> {
  const logger = createLogger((process.env.TELAGENT_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info');

  const config = loadConfigFromEnv();

  // Kill any stale telagent process on the API port before starting
  if (await killStaleTelagentOnPort(config.port)) {
    logger.info(`killed stale process on port ${config.port}`);
  }

  const node = new TelagentNode(config);

  await node.start();
  logger.info(`telagent node started at http://${config.host}:${config.port}`);
  logger.info(`chainId: ${config.chain.chainId}`);

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`received ${signal}, shutting down`);
    await node.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
