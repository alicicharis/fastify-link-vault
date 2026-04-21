# Rate Limiting on Auth + Create Routes

## Why

Unprotected auth and link-creation endpoints are trivially brute-forceable and abusable. Redis is already wired up, making a sliding-window rate limiter cheap to add.

## What

`POST /auth/register`, `POST /auth/login`, and `POST /links` enforce per-IP rate limits via Redis. Exceeding the limit returns `429 Too Many Requests` with a `Retry-After` header. Done when all three routes reject excess requests and allow traffic under the limit.

## Context

**Relevant files:**

- `src/plugins/redis.ts` — Redis client decorated onto `app.redis`; used for caching
- `src/routes/auth.ts` — register + login handlers; add `preHandler` here
- `src/routes/links.ts` — link creation handler (`POST /`); add `preHandler` here
- `src/app.ts` — plugin/route registration order

**Patterns to follow:**

- Fastify plugin decorated with `fastify-plugin` and registered in `app.ts` (see `src/plugins/redis.ts`)
- `preHandler` on individual routes (see `app.authenticate` usage in `src/routes/links.ts`)

**Key decisions already made:**

- Rate limit store: Redis (`app.redis` via `ioredis`) — already available, no new dep
- Algorithm: sliding window counter (INCR + EXPIRE)
- Limits: 10 req/min for auth routes, 30 req/min for link creation
- Key: `rate:<route-key>:<ip>` (e.g. `rate:auth:192.168.1.1`)

## Constraints

**Must:**

- Use `app.redis` — no new Redis connection
- Return `429` with `Retry-After: <seconds>` header on limit exceeded
- Use `preHandler` hook pattern consistent with `app.authenticate`

**Must not:**

- Add new npm dependencies (`@fastify/rate-limit` or similar) — implement inline with ioredis
- Modify unrelated routes (redirect, delete, stats)
- Refactor existing handler logic

**Out of scope:**

- Per-user rate limiting (IP-only for now)
- Rate limiting on redirect route
- Configurable limits via env vars

## Tasks

### T1: Rate limiter utility

**Do:** Create `src/utils/rateLimit.ts` exporting a `createRateLimiter(redis, key, max, windowSecs)` function. Uses Redis INCR + EXPIRE sliding window. Returns `{ allowed: boolean; retryAfter: number }`.

**Files:** `src/utils/rateLimit.ts`

**Verify:** `npm run typecheck` passes

### T2: Apply rate limiting to auth routes

**Do:** In `src/routes/auth.ts`, add a `preHandler` to both `POST /register` and `POST /login` that calls the rate limiter with key `rate:auth:<ip>`, max 10, window 60s. Reply `429` with `Retry-After` header if not allowed.

**Files:** `src/routes/auth.ts`

**Verify:** `npm run typecheck` passes. Manual: `for i in $(seq 1 12); do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"x@x.com","password":"wrongpass"}'; done` — first 10 return 401, 11th+ return 429.

### T3: Apply rate limiting to link creation

**Do:** In `src/routes/links.ts`, add a `preHandler` array `[app.authenticate, rateLimiter]` to `POST /` with key `rate:links:create:<ip>`, max 30, window 60s.

**Files:** `src/routes/links.ts`

**Verify:** `npm run typecheck` passes. Manual: send 31 authenticated `POST /links` requests — 31st returns 429.

## Done

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] Manual: 11th `POST /auth/login` in under 60s returns `429` with `Retry-After` header
- [ ] Manual: 31st `POST /links` in under 60s returns `429` with `Retry-After` header
- [ ] No regressions: redirect, delete, stats routes unaffected
