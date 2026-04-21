import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';

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
  app.post(
    '/register',
    { schema: { body: bodySchema } },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply,
    ) => {
      const { email, password } = request.body;

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
    { schema: { body: bodySchema } },
    async (
      request: FastifyRequest<{ Body: { email: string; password: string } }>,
      reply: FastifyReply,
    ) => {
      const { email, password } = request.body;

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
