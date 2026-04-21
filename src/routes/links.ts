import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { links } from '../db/schema';
import { createLinkBody } from '../schemas/links.schema';
import { generateShortCode } from '../utils/shortcode';

export default async function linksRoutes(app: FastifyInstance) {
  app.post('/', {
    schema: { body: createLinkBody },
    preHandler: app.authenticate,
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
