# Link Creation and Redirect

## Why

Users need to shorten URLs and have them redirect. This is the core feature of link-vault — without it, the API has no value beyond auth.

## What

Two endpoints: `POST /links` (authenticated, creates short link) and `GET /:code` (public, redirects). Done when a user can create a link and have the short URL redirect to the original, with visit logging and Redis caching in place.

## Context

**Relevant files:**

- `src/db/schema.ts` — existing Drizzle schema; add `links` and `visits` tables here
- `src/app.ts` — register new routes here
- `src/routes/auth.ts` — pattern to follow for route handlers and JSON Schema inline validation
- `src/plugins/jwt.ts` — `app.authenticate` preHandler decorator, already wired up
- `src/types/fastify.d.ts` — extend with Redis client and any new decorators
- `src/plugins/db.ts` — pattern to follow for new plugins (e.g., Redis plugin)
- `src/plugins/env.ts` — extend env schema with `REDIS_URL` and `BASE_URL`

**Patterns to follow:**

- Inline JSON Schema on route options (see `src/routes/auth.ts:6-14`)
- `app.db` for all DB queries via Drizzle ORM (see `src/routes/auth.ts:26-29`)
- `app.authenticate` as preHandler for protected routes (see `src/plugins/jwt.ts`)
- `fp()` wrapper for all plugins (see `src/plugins/jwt.ts:1,5`)

**Key decisions already made:**

- Drizzle ORM with `drizzle-orm/node-postgres` — no raw SQL
- `@fastify/jwt` for auth — `request.user.userId` after `jwtVerify`
- nanoid for short code generation (must install)
- `ioredis` for Redis client (must install)
- `geoip-lite` for country lookup (must install)
- Redis key pattern: `link:{short_code}` → JSON `{ original_url, expires_at, link_id }`
- Short code: 6-char alphanumeric, collision-checked

## Constraints

**Must:**

- Use Drizzle ORM for all DB queries
- Use `app.authenticate` preHandler on `POST /links`
- Fire-and-forget visit logging (no `await` before redirect)
- Check `expires_at` before redirecting; return 404 if expired
- Cache on read (populate on miss, 24h TTL)

**Must not:**

- Add dependencies beyond: `nanoid`, `ioredis`, `geoip-lite`, `@types/geoip-lite`
- Modify `src/routes/auth.ts` or `src/plugins/jwt.ts`
- Block redirect response on visit insert

**Out of scope:**

- Link management (list, delete, update)
- Visit analytics queries
- Rate limiting
- Custom short codes

## Tasks

### T1: DB schema + migrations + Redis plugin

**Do:**

- Add `links` and `visits` tables to `src/db/schema.ts`
  - `links`: `id` (uuid pk), `short_code` (text unique not null), `original_url` (text not null), `user_id` (uuid not null → users.id), `expires_at` (timestamp nullable), `created_at` (timestamp not null defaultNow)
  - `visits`: `id` (uuid pk), `link_id` (uuid not null → links.id), `ip` (text), `referrer` (text), `user_agent` (text), `country` (text), `visited_at` (timestamp not null defaultNow)
- Run `npm run db:generate` then `npm run db:migrate`
- Add `REDIS_URL` and `BASE_URL` to env plugin schema and `FastifyInstance.config` type in `src/types/fastify.d.ts`
- Create `src/plugins/redis.ts` — register `ioredis`, decorate `app.redis`
- Register `redisPlugin` in `src/app.ts`
- Install: `npm install ioredis nanoid geoip-lite` and `npm install -D @types/geoip-lite`

**Files:** `src/db/schema.ts`, `src/plugins/redis.ts`, `src/plugins/env.ts`, `src/types/fastify.d.ts`, `src/app.ts`

**Verify:** `npm run typecheck` passes; `npm run db:generate` produces migration for links + visits tables

---

### T2: Short code utility + JSON Schema

**Do:**

- Create `src/utils/shortcode.ts` — export `generateShortCode(): string` using nanoid with 6-char alphanumeric alphabet (`0-9a-zA-Z`)
- Create `src/schemas/links.schema.ts` — export `createLinkBody` JSON Schema object: `{ original_url: string (format: uri), expires_at?: string (format: date-time) }`, required `['original_url']`, `additionalProperties: false`

**Files:** `src/utils/shortcode.ts`, `src/schemas/links.schema.ts`

**Verify:** `npm run typecheck` passes

---

### T3: POST /links route

**Do:**

- Create `src/routes/links.ts` — register `POST /` with:
  - `schema: { body: createLinkBody }` from `src/schemas/links.schema.ts`
  - `preHandler: app.authenticate`
  - Generate short code via `generateShortCode()`, query `links` table for collision, regenerate up to 5 times if collision
  - Insert into `links` table with `user_id: request.user.userId`
  - Return 201: `{ id, short_code, short_url: \`${app.config.BASE_URL}/${short_code}\`, original_url, created_at }`
- Register in `src/app.ts` with prefix `/links`

**Files:** `src/routes/links.ts`, `src/app.ts`

**Verify:** `npm run typecheck` passes; Manual: `POST /links` with valid JWT returns 201 with `short_url`; without JWT returns 401

---

### T4: Analytics service + GET /:code redirect route

**Do:**

- Create `src/services/analytics.service.ts` — export `logVisit(app, { linkId, ip, referrer, userAgent, country })` that inserts into `visits` table (no return value needed)
- Create `src/routes/redirect.ts` — register `GET /:code` with:
  - Check Redis `link:{code}` → parse JSON
  - On miss: query `links` table by `short_code`; if not found → 404; populate Redis with 24h TTL
  - Check `expires_at`: if set and in the past → 404 `{ error: 'link_expired' }`
  - Fire-and-forget: call `logVisit` with `request.ip`, `request.headers.referer`, `request.headers['user-agent']`, `geoip.lookup(ip)?.country`
  - Return `reply.redirect(302, original_url)`
- Register in `src/app.ts` (no prefix — top-level `/:code`)

**Files:** `src/services/analytics.service.ts`, `src/routes/redirect.ts`, `src/app.ts`

**Verify:** `npm run typecheck` passes; Manual: `GET /{short_code}` returns 302 to original URL; second request hits Redis cache; expired link returns 404

## Done

- [ ] `npm run typecheck` passes with no errors
- [ ] `npm run build` succeeds
- [ ] Manual: `POST /auth/register` → `POST /links` with token → `GET /{code}` returns 302
- [ ] Manual: `GET /{code}` a second time (cache hit path) still redirects correctly
- [ ] Manual: link with past `expires_at` returns 404 `{ error: 'link_expired' }`
- [ ] Manual: `GET /nonexistent` returns 404
- [ ] No regressions: `POST /auth/register` and `POST /auth/login` still work
