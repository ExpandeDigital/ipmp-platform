/**
 * IP+MP Platform — Cliente de base de datos
 *
 * Conexión a PostgreSQL vía postgres-js + Drizzle ORM.
 * Optimizado para entornos serverless (Vercel).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Pool de conexiones optimizado para serverless.
// max: 1 porque cada función serverless es efímera y no reusa conexiones.
const client = postgres(process.env.DATABASE_URL, {
  max: 1,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // requerido para algunos pools de Postgres como Supabase/Railway
});

export const db = drizzle(client, { schema });

export * from './schema';
