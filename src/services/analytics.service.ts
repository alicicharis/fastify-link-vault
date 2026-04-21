import { FastifyInstance } from 'fastify';
import { sql, eq, isNotNull } from 'drizzle-orm';
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

export async function getStats(app: FastifyInstance, linkId: string) {
  const [totalRow] = await app.db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(visits)
    .where(eq(visits.linkId, linkId));

  const dailyRows = await app.db
    .select({
      date: sql<string>`to_char(date_trunc('day', ${visits.visitedAt}), 'YYYY-MM-DD')`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(visits)
    .where(eq(visits.linkId, linkId))
    .groupBy(sql`date_trunc('day', ${visits.visitedAt})`)
    .orderBy(sql`date_trunc('day', ${visits.visitedAt})`);

  const countryRows = await app.db
    .select({
      country: visits.country,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(visits)
    .where(eq(visits.linkId, linkId))
    .groupBy(visits.country)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const referrerRows = await app.db
    .select({
      referrer: visits.referrer,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(visits)
    .where(eq(visits.linkId, linkId))
    .groupBy(visits.referrer)
    .having(isNotNull(visits.referrer))
    .orderBy(sql`count(*) desc`)
    .limit(10);

  return {
    total_clicks: totalRow?.count ?? 0,
    clicks_per_day: dailyRows.map((r) => ({ date: r.date, count: r.count })),
    top_countries: countryRows.map((r) => ({ country: r.country, count: r.count })),
    top_referrers: referrerRows.map((r) => ({ referrer: r.referrer, count: r.count })),
  };
}
