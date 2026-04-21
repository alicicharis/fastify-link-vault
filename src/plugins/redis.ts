import fp from 'fastify-plugin';
import Redis from 'ioredis';

export default fp(async (app) => {
  const redis = new Redis(app.config.REDIS_URL);

  app.decorate('redis', redis);

  app.addHook('onClose', async () => {
    await redis.quit();
  });
});
