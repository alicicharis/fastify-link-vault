import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { links, visits } from '../db/schema';
import { createLinkBody, listLinksResponse } from '../schemas/links.schema';
import { generateShortCode } from '../utils/shortcode';
import { getStats } from '../services/analytics.service';
import { createRateLimiter } from '../utils/rateLimit';

export default async function linksRoutes(app: FastifyInstance) {
  app.get('/', {
    schema: { response: { 200: listLinksResponse } },
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const result = await app.db
        .select({
          id: links.id,
          shortCode: links.shortCode,
          originalUrl: links.originalUrl,
          createdAt: links.createdAt,
          clickCount: sql<number>`cast(count(${visits.id}) as int)`,
        })
        .from(links)
        .leftJoin(visits, eq(visits.linkId, links.id))
        .where(eq(links.userId, request.user.userId))
        .groupBy(links.id);

      return reply.send(
        result.map((row) => ({
          id: row.id,
          short_code: row.shortCode,
          short_url: `${app.config.BASE_URL}/${row.shortCode}`,
          original_url: row.originalUrl,
          created_at: row.createdAt,
          click_count: row.clickCount,
        })),
      );
    },
  });

  app.delete('/:id', {
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await app.db
        .select()
        .from(links)
        .where(eq(links.id, id))
        .limit(1);

      if (result.length === 0) {
        return reply.status(404).send({ error: 'not_found' });
      }

      const link = result[0]!;

      if (link.userId !== request.user.userId) {
        return reply.status(403).send({ error: 'forbidden' });
      }

      await app.db.delete(links).where(eq(links.id, id));
      await app.redis.del(`link:${link.shortCode}`);

      return reply.status(204).send();
    },
  });

  app.get('/:id/stats', {
    preHandler: app.authenticate,
    handler: async (request, reply) => {
      const { id } = request.params as { id: string };

      const result = await app.db
        .select()
        .from(links)
        .where(eq(links.id, id))
        .limit(1);

      if (result.length === 0) {
        return reply.status(404).send({ error: 'not_found' });
      }

      if (result[0]!.userId !== request.user.userId) {
        return reply.status(403).send({ error: 'forbidden' });
      }

      const stats = await getStats(app, id);
      return reply.send(stats);
    },
  });

  const linksCreateRateLimiter = async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;
    const limiter = createRateLimiter(app.redis, `rate:links:create:${ip}`, 30, 60);
    const { allowed, retryAfter } = await limiter();
    if (!allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(retryAfter))
        .send({ error: 'too_many_requests' });
    }
  };

  app.post('/', {
    schema: { body: createLinkBody },
    preHandler: [app.authenticate, linksCreateRateLimiter],
    handler: async (request, reply) => {
      const body = request.body as {
        original_url: string;
        expires_at?: string;
      };

      let shortCode: string | null = null;
      for (let i = 0; i < 5; i++) {
        const candidate = generateShortCode();
        const existing = await app.db
          .select()
          .from(links)
          .where(eq(links.shortCode, candidate))
          .limit(1);
        if (existing.length === 0) {
          shortCode = candidate;
          break;
        }
      }

      if (!shortCode) {
        return reply
          .status(500)
          .send({ error: 'failed_to_generate_short_code' });
      }

      const result = await app.db
        .insert(links)
        .values({
          shortCode,
          originalUrl: body.original_url,
          userId: request.user.userId,
          expiresAt: body.expires_at ? new Date(body.expires_at) : null,
        })
        .returning();

      const link = result[0]!;

      return reply.status(201).send({
        id: link.id,
        short_code: link.shortCode,
        short_url: `${app.config.BASE_URL}/${link.shortCode}`,
        original_url: link.originalUrl,
        created_at: link.createdAt,
      });
    },
  });
}
