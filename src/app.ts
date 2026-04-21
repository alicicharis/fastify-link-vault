import Fastify from 'fastify';

const isDev = process.env['NODE_ENV'] !== 'production';

export function buildApp() {
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
