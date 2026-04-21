import { FastifyInstance } from 'fastify';
import { visits } from '../db/schema';

export async function logVisit(
  app: FastifyInstance,
  params: {
    linkId: string;
    ip?: string;
    referrer?: string;
    userAgent?: string;
    country?: string;
  },
) {
  await app.db.insert(visits).values({
    linkId: params.linkId,
    ip: params.ip ?? null,
    referrer: params.referrer ?? null,
    userAgent: params.userAgent ?? null,
    country: params.country ?? null,
  });
}
