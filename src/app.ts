import Fastify from 'fastify';
import envPlugin from './plugins/env';
import dbPlugin from './plugins/db';
import jwtPlugin from './plugins/jwt';
import authRoutes from './routes/auth';

const isDev = process.env['NODE_ENV'] !== 'production';

export async function buildApp() {
  const app = Fastify({
    logger: isDev
      ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
      : true,
  });

  await app.register(envPlugin);
  await app.register(dbPlugin);
  await app.register(jwtPlugin);
  await app.register(authRoutes, { prefix: '/auth' });

  app.get('/health', async () => {
    return { status: 'ok' };
  });

  return app;
}
