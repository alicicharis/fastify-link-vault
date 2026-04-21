import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyRequest, FastifyReply } from 'fastify';

export default fp(async (app) => {
  await app.register(fastifyJwt, { secret: app.config.JWT_SECRET });

  app.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        reply.code(401).send({ error: 'unauthorized' });
      }
    },
  );
});
