# User Auth

## Why

The app has no user model yet — every future feature (vault, per-user links) needs identity. Ship the smallest viable auth surface (register/login + JWT) so the rest of the product can assume a `userId`.

## What

Two public endpoints and a reusable `authenticate` preHandler:

- `POST /auth/register` → creates a user, returns a signed JWT.
- `POST /auth/login` → verifies credentials, returns a signed JWT.
- `app.authenticate` decorator that protected routes can attach via `preHandler`.

Done when: both endpoints work against a real Postgres DB, JWTs round-trip, and a smoke test of the happy + unhappy paths (duplicate email, wrong password) returns the documented status codes.

## Context

**Relevant files:**

- `src/app.ts` — Fastify bootstrap; where new plugins get registered.
- `src/server.ts` — entrypoint; reads `HOST`/`PORT`, calls `buildApp()`.
- `src/plugins/` — empty; new plugin files go here (db, jwt, env).
- `src/routes/` — empty; route files go here (`auth.ts`).
- `package.json` — already has `@fastify/env`, `fastify`; needs new deps.
- `tsconfig.json` — strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on. Be careful with optional fields.

**Patterns to follow:**

- App is composed in `buildApp()` (`src/app.ts`). Register plugins there in order: env → db → jwt → routes.
- Existing code uses bracket access for `process.env` (e.g. `process.env['PORT']`) because of `noUncheckedIndexedAccess`. Keep this style — or move all env reads through `@fastify/env` (preferred for new code).
- Use Fastify v5 plugin shape: `fp(async (app) => { ... })` from `fastify-plugin`.
- Route schemas use Fastify's built-in JSON Schema validation (no Zod / TypeBox yet — don't introduce one).

**Key decisions already made:**

- **ORM:** Drizzle ORM against PostgreSQL (`drizzle-orm`, `drizzle-kit`, `pg`).
- **JWT:** `@fastify/jwt`.
- **Hashing:** `bcrypt` at 10 rounds.
- **IDs:** UUIDs (Postgres `gen_random_uuid()` via `pgcrypto`, or `crypto.randomUUID()` in app — prefer DB default).
- **Token payload:** `{ userId, email }`. No refresh tokens, no sessions.
- **Migrations:** `drizzle-kit generate` → SQL files checked into `drizzle/` at repo root.

## Constraints

**Must:**

- Validate request bodies with JSON Schema on the Fastify route (not ad-hoc in the handler).
- Store only bcrypt hashes — never the plaintext password, never log it.
- Email uniqueness enforced at the DB level (`UNIQUE` constraint), not only in application code.
- Read `JWT_SECRET` and `DATABASE_URL` via `@fastify/env` with a schema; fail fast on boot if missing.
- Return `409` for duplicate email on register, `401` for any login failure (don't distinguish "user not found" vs "bad password" to the client).

**Must not:**

- Add dependencies beyond: `drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@fastify/jwt`, `bcrypt`, `@types/bcrypt`, `fastify-plugin`.
- Modify `src/server.ts` beyond what's needed to surface startup errors.
- Refactor the existing `/health` route.
- Introduce a session store, refresh tokens, email verification, or OAuth.

**Out of scope:**

- Protected routes (the `authenticate` decorator is built, but no feature route uses it yet).
- Password reset / change-password flow.
- Rate limiting on auth endpoints.
- GitHub OAuth (`@fastify/oauth2`) — noted as a future enhancement.

## Tasks

### T1: Database plugin + users schema + first migration

**Do:**

- Install deps: `drizzle-orm pg`, dev: `drizzle-kit @types/pg`.
- Add `drizzle.config.ts` at repo root pointing at `src/db/schema.ts` and `drizzle/` for output.
- Create `src/db/schema.ts` with `users` table: `id uuid pk default gen_random_uuid()`, `email text unique not null`, `password_hash text not null`, `created_at timestamptz not null default now()`.
- Create `src/plugins/db.ts` — `fastify-plugin` that reads `DATABASE_URL`, opens a `pg` Pool, wraps in Drizzle, decorates `app.db`, and closes the pool on `onClose`.
- Update `src/plugins/env.ts` (new) to declare `DATABASE_URL` and `JWT_SECRET` via `@fastify/env`.
- Register env plugin then db plugin in `src/app.ts` (env must load first).
- Run `npx drizzle-kit generate` to produce the initial migration SQL in `drizzle/`.
- Add `db:generate` and `db:migrate` scripts to `package.json` (migrate can use `drizzle-kit migrate` or a small `src/db/migrate.ts` runner — pick one and stick with it).
- Add `CREATE EXTENSION IF NOT EXISTS pgcrypto;` as the first statement in the generated migration (or a pre-migration) so `gen_random_uuid()` works.

**Files:** `drizzle.config.ts`, `src/db/schema.ts`, `src/db/index.ts` (type re-exports if needed), `src/plugins/env.ts`, `src/plugins/db.ts`, `src/app.ts`, `package.json`, `drizzle/0000_*.sql`.

**Verify:**

- `npm run typecheck` passes.
- `npm run build` passes.
- Manual: with a local Postgres running and `DATABASE_URL` set, `npm run db:migrate` creates the `users` table. Confirm via `psql -c '\d users'` that columns/constraints match.
- Starting the server boots cleanly; hitting `GET /health` still returns `{ status: "ok" }`.

### T2: JWT plugin + authenticate decorator

**Do:**

- Install `@fastify/jwt` and `fastify-plugin`.
- Create `src/plugins/jwt.ts` — registers `@fastify/jwt` with `secret` from env, decorates `app.authenticate` as an async preHandler that calls `request.jwtVerify()` and surfaces 401 on failure.
- Augment Fastify type declarations so `app.authenticate`, `app.jwt`, and `request.user` (`{ userId: string; email: string }`) are typed. Put this in `src/types/fastify.d.ts` (or colocated with the plugin — pick one).
- Register the jwt plugin in `src/app.ts` after db.

**Files:** `src/plugins/jwt.ts`, `src/types/fastify.d.ts`, `src/app.ts`.

**Verify:**

- `npm run typecheck` passes — the type augmentation compiles without `any`.
- Manual: temporarily add `app.get('/whoami', { preHandler: [app.authenticate] }, ...)` in a scratch branch; `curl` without a token → 401, with a valid token → payload echoed. Revert before committing T2.

### T3: Register + login routes

**Do:**

- Install `bcrypt` and `@types/bcrypt`.
- Create `src/routes/auth.ts` — Fastify plugin exposing `POST /auth/register` and `POST /auth/login`.
- Define a shared body schema: `{ email: string (format: email), password: string (minLength: 8, maxLength: 128) }`.
- Register handler: look up by email → 409 `{ error: "email_taken" }` if exists; else bcrypt-hash (10 rounds), insert, sign JWT with `{ userId, email }`, return `{ token }` with 201.
- Login handler: look up by email; if not found OR `bcrypt.compare` fails → 401 `{ error: "invalid_credentials" }`; else sign JWT, return `{ token }` with 200.
- Use Drizzle query builder (`db.select().from(users).where(eq(users.email, email))`) — no raw SQL.
- Register the routes plugin in `src/app.ts` under prefix `/auth` (or let the file own the full paths — pick one, match existing convention if any; there is none, so prefix at registration is cleaner).

**Files:** `src/routes/auth.ts`, `src/app.ts`, `package.json`.

**Verify:**

- `npm run typecheck` passes.
- `npm run build` passes.
- Manual (server running, DB migrated, `JWT_SECRET` set):
  - `curl -XPOST localhost:3000/auth/register -H 'content-type: application/json' -d '{"email":"a@b.com","password":"hunter22!"}'` → 201 with `{ token }`.
  - Repeat same → 409.
  - Missing/invalid email or short password → 400 from JSON Schema.
  - `curl -XPOST localhost:3000/auth/login` with correct creds → 200 `{ token }`; wrong password → 401; unknown email → 401 (same body).
  - Decode the returned JWT at jwt.io — payload contains `userId` (uuid) and `email`, nothing else sensitive.
- Spot-check DB: `select id, email, length(password_hash) from users;` — hash length ~60, email lowercase/as-submitted (decide and document), no plaintext anywhere.

## Done

- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes.
- [ ] `npm run db:migrate` applies cleanly from an empty database.
- [ ] Manual: full register → login → decode-token flow works against local Postgres.
- [ ] Manual: unhappy paths (409 on duplicate, 401 on bad password, 400 on invalid body) return the documented shapes.
- [ ] `GET /health` still returns `{ status: "ok" }` (no regression in app bootstrap).
- [ ] No plaintext password in any log line (grep the pino output during the manual run).
