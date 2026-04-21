import fp from 'fastify-plugin';
import fastifyEnv from '@fastify/env';

const schema = {
  type: 'object',
  required: ['DATABASE_URL', 'JWT_SECRET', 'REDIS_URL', 'BASE_URL'],
  properties: {
    DATABASE_URL: { type: 'string' },
    JWT_SECRET: { type: 'string' },
    REDIS_URL: { type: 'string' },
    BASE_URL: { type: 'string' },
    PORT: { type: 'string', default: '3000' },
    HOST: { type: 'string', default: '0.0.0.0' },
  },
};

export default fp(async (app) => {
  await app.register(fastifyEnv, { schema, dotenv: true });
});
