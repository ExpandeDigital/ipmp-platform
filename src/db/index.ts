/**
 * IP+MP Platform — Cliente de base de datos
 *
 * Conexión a PostgreSQL vía postgres-js + Drizzle ORM.
 * Optimizado para entornos serverless (Vercel).
 *
 * Usa inicialización lazy para evitar errores durante el build
 * de Next.js (donde las env vars no están disponibles aún).
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const client = postgres(url, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return drizzle(client, { schema });
}

// Lazy singleton: solo se conecta cuando se usa por primera vez en runtime,
// no durante el build de Next.js.
let _db: ReturnType<typeof createDb> | undefined;
export const db = new Proxy({} as ReturnType<typeof createDb>, {
  get(_target, prop, receiver) {
    if (!_db) _db = createDb();
    const value = Reflect.get(_db, prop, receiver);
    return typeof value === 'function' ? value.bind(_db) : value;
  },
});

export * from './schema';
