import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { createRateLimiter } from '../utils/rateLimit';

const bodySchema = {
  type: 'object',
  required: ['email', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    password: { type: 'string', minLength: 8, maxLength: 128 },
  },
  additionalProperties: false,
};

export default async function authRoutes(app: FastifyInstance) {
  const authRateLimiter = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const ip = request.ip;
    const limiter = createRateLimiter(app.redis, `rate:auth:${ip}`, 10, 60);
    const { allowed, retryAfter } = await limiter();
    if (!allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(retryAfter))
        .send({ error: 'too_many_requests' });
    }
  };

  const tokenResponse = {
    type: 'object',
    properties: { token: { type: 'string' } },
  };

  const errorResponse = {
    type: 'object',
    properties: { error: { type: 'string' } },
  };

  app.post(
    '/register',
    {
      schema: {
        tags: ['Auth'],
        body: bodySchema,
        response: {
          201: tokenResponse,
          409: errorResponse,
          429: errorResponse,
          500: errorResponse,
        },
      },
      preHandler: authRateLimiter,
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const existing = await app.db
        .select()
        .from(users)
        .where(eq(users.email, email));
      if (existing.length > 0) {
        return reply.code(409).send({ error: 'email_taken' });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const [user] = await app.db
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id, email: users.email });

      if (!user) {
        return reply.code(500).send({ error: 'internal_error' });
      }

      const token = app.jwt.sign({ userId: user.id, email: user.email });
      return reply.code(201).send({ token });
    },
  );

  app.post(
    '/login',
    {
      schema: {
        tags: ['Auth'],
        body: bodySchema,
        response: {
          200: tokenResponse,
          401: errorResponse,
          429: errorResponse,
        },
      },
      preHandler: authRateLimiter,
    },
    async (request, reply) => {
      const { email, password } = request.body as {
        email: string;
        password: string;
      };

      const [user] = await app.db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return reply.code(401).send({ error: 'invalid_credentials' });
      }

      const token = app.jwt.sign({ userId: user.id, email: user.email });
      return reply.code(200).send({ token });
    },
  );
}
