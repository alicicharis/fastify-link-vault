/// <reference path="../types/fastify.d.ts" />
import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';

export default fp(async (app) => {
  const pool = new Pool({ connectionString: app.config.DATABASE_URL });

  const db = drizzle(pool, { schema });

  app.decorate('db', db);

  app.addHook('onClose', async () => {
    await pool.end();
  });
});
