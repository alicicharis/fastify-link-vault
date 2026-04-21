import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import * as geoip from 'geoip-lite';
import { links } from '../db/schema';
import { logVisit } from '../services/analytics.service';

export default async function redirectRoutes(app: FastifyInstance) {
  app.get('/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const cacheKey = `link:${code}`;

    let linkData: {
      original_url: string;
      expires_at: string | null;
      link_id: string;
    } | null = null;

    const cached = await app.redis.get(cacheKey);
    if (cached) {
      linkData = JSON.parse(cached);
    } else {
      const result = await app.db
        .select()
        .from(links)
        .where(eq(links.shortCode, code))
        .limit(1);

      if (result.length === 0) {
        return reply.status(404).send({ error: 'not_found' });
      }

      const link = result[0]!;
      linkData = {
        original_url: link.originalUrl,
        expires_at: link.expiresAt ? link.expiresAt.toISOString() : null,
        link_id: link.id,
      };

      await app.redis.set(cacheKey, JSON.stringify(linkData), 'EX', 86400);
    }

    if (linkData!.expires_at && new Date(linkData!.expires_at) < new Date()) {
      return reply.status(404).send({ error: 'link_expired' });
    }

    const ip = request.ip;
    const referrer = request.headers.referer;
    const userAgent = request.headers['user-agent'];
    const geo = geoip.lookup(ip);

    logVisit(app, {
      linkId: linkData!.link_id,
      ...(ip !== undefined && { ip }),
      ...(referrer !== undefined && { referrer }),
      ...(userAgent !== undefined && { userAgent }),
      ...(geo?.country !== undefined && { country: geo.country }),
    });

    return reply.redirect(linkData!.original_url, 302);
  });
}
