# Link Management and Analytics

## Why

Users need to manage their shortened links and understand how they perform. These endpoints complete the core CRUD surface and add the analytics data already being collected via the `visits` table.

## What

Three new authenticated endpoints:

- `GET /links` — list user's links with click counts
- `DELETE /links/:id` — delete own link, purge Redis cache
- `GET /links/:id/stats` — click total, daily breakdown, top countries, top referrers

## Context

**Relevant files:**

- `src/routes/links.ts` — existing POST /links route; add GET and DELETE here
- `src/db/schema.ts` — `links` and `visits` tables with their columns
- `src/schemas/links.schema.ts` — Fastify JSON schema definitions; add new schemas here
- `src/services/analytics.service.ts` — `logVisit` helper; add stats query here
- `src/app.ts` — route registration (no changes needed)
- `src/routes/redirect.ts` — shows Redis cache key pattern: `link:<shortCode>`
- `src/plugins/redis.ts` — `app.redis` is an ioredis instance

**Patterns to follow:**

- Route handler shape: `preHandler: app.authenticate`, inline handler, snake_case JSON response — see `src/routes/links.ts`
- Drizzle queries using `app.db.select().from(...).where(eq(...))` — see `src/routes/links.ts` and `src/routes/redirect.ts`
- Redis cache key: `link:<shortCode>` — see `src/routes/redirect.ts:39`
- JSON schema objects exported from `src/schemas/links.schema.ts`, referenced in route schema option

**Key decisions already made:**

- Drizzle ORM + PostgreSQL (no raw SQL)
- ioredis for Redis
- JWT auth via `app.authenticate` preHandler; `request.user.userId` holds the user ID
- No new dependencies

## Constraints

**Must:**

- Verify link ownership (`links.userId === request.user.userId`) before DELETE
- Purge `link:<shortCode>` from Redis on DELETE
- Return 404 with `{ error: 'not_found' }` for missing links, 403 with `{ error: 'forbidden' }` for ownership mismatch
- Follow existing snake_case JSON response convention

**Must not:**

- Add new npm dependencies
- Modify unrelated routes or plugins
- Refactor existing code

**Out of scope:**

- Pagination for GET /links
- Unique visitor counting
- Real-time analytics

## Tasks

### T1: GET /links and DELETE /links/:id

**Do:**

- Add `GET /` handler to `src/routes/links.ts` — query `links` table filtered by `userId`, join/count from `visits` table (or subquery) for click count per link; return array with `id`, `short_code`, `short_url`, `original_url`, `created_at`, `click_count`
- Add `DELETE /:id` handler to `src/routes/links.ts` — fetch link by id, check ownership, delete from `links`, delete Redis key `link:<shortCode>`
- Add any needed JSON schemas to `src/schemas/links.schema.ts`

**Files:** `src/routes/links.ts`, `src/schemas/links.schema.ts`

**Verify:**

- `npm run typecheck` passes
- Manual: `POST /auth/register` → `POST /links` → `GET /links` returns array with `click_count: 0`
- Manual: `DELETE /links/:id` returns 204; subsequent `GET /links` excludes it
- Manual: `DELETE /links/:id` with another user's token returns 403

### T2: GET /links/:id/stats

**Do:**

- Add `getStats(app, linkId)` function to `src/services/analytics.service.ts` — run three queries against `visits`:
  1. Total count
  2. Daily breakdown: group by `date_trunc('day', visited_at)`, count per day, order ASC
  3. Top countries: group by `country`, count DESC, limit 10
  4. Top referrers: group by `referrer`, count DESC, limit 10 (exclude null)
- Add `GET /:id/stats` handler to `src/routes/links.ts` — verify ownership, call `getStats`, return structured response
- Response shape:
  ```json
  {
    "total_clicks": 42,
    "clicks_per_day": [{ "date": "2026-04-20", "count": 10 }],
    "top_countries": [{ "country": "US", "count": 30 }],
    "top_referrers": [{ "referrer": "https://example.com", "count": 5 }]
  }
  ```

**Files:** `src/services/analytics.service.ts`, `src/routes/links.ts`

**Verify:**

- `npm run typecheck` passes
- Manual: visit a short link 3 times → `GET /links/:id/stats` returns `total_clicks: 3` with correct daily entry
- Manual: `GET /links/:id/stats` for another user's link returns 403

## Done

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Manual: full flow — register, create link, visit it, list links (click_count increments), fetch stats, delete link
- [ ] No regressions: redirect still works after link creation; 404 still returns for unknown codes
