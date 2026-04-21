import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Redis } from 'ioredis';

declare module 'fastify' {
  interface FastifyInstance {
    config: {
      DATABASE_URL: string;
      JWT_SECRET: string;
      REDIS_URL: string;
      BASE_URL: string;
      PORT: string;
      HOST: string;
    };
    db: NodePgDatabase<typeof schema>;
    redis: Redis;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { userId: string; email: string };
    user: { userId: string; email: string };
  }
}
