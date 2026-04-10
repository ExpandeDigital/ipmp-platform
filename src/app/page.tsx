/**
 * IP+MP Platform — Homepage
 *
 * Esta página es el "tablero de cimientos vivos" de la Fase 0.
 * Muestra el estado del sistema, conexión a base de datos,
 * tenants registrados y plantillas disponibles.
 *
 * En fases posteriores, esta página será reemplazada por el
 * dashboard del operador. Por ahora cumple la función de health-check
 * visual y de validación del primer deploy.
 */

import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { count } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const EXPECTED_TENANTS = 7;
const EXPECTED_TEMPLATES = 13;

async function getSystemStatus() {
  try {
    const [tenantsResult] = await db.select({ count: count() }).from(tenants);
    const [templatesResult] = await db.select({ count: count() }).from(templates);
    return {
      dbStatus: 'ok' as const,
      tenantCount: Number(tenantsResult.count),
      templateCount: Number(templatesResult.count),
      error: null,
    };
  } catch (error) {
    return {
      dbStatus: 'error' as const,
      tenantCount: 0,
      templateCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function HomePage() {
  const { dbStatus, tenantCount, templateCount, error } = await getSystemStatus();
  const tablesExist = !error || !error.includes('does not exist');
  const needsInit = dbStatus === 'ok' && (tenantCount === 0 || templateCount === 0);

  return (
    <main className="min-h-screen bg-oxford-blue text-seasalt p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <header className="mb-12 border-b border-davy-gray pb-8">
          <p className="text-amber-brand font-mono text-sm mb-2">
            PLATAFORMA IP+MP · v0.1.0 · FASE 0 — CIMIENTOS
          </p>
          <h1 className="text-5xl font-bold mb-3 tracking-tight">Cimientos vivos</h1>
          <p className="text-davy-gray text-lg max-w-2xl">
            Pipeline de investigación periodística y producción de contenido medible.
            <br />
            Expande Digital Consultores SpA · Sociedad de Inversiones Dreamoms SpA
          </p>
        </header>

        {/* System Status */}
        <section className="space-y-6">
          <h2 className="text-2xl font-bold mb-4">Estado del sistema</h2>

          {/* Database connection */}
          <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-sm text-davy-gray uppercase tracking-wider mb-1">
                  Conexión Postgres (Railway)
                </p>
                <p className="text-lg">
                  {dbStatus === 'ok' ? 'Operativa' : 'Caída'}
                </p>
              </div>
              <span
                className={`text-2xl ${
                  dbStatus === 'ok' ? 'text-green-400' : 'text-red-400'
                }`}
              >
                ●
              </span>
            </div>
            {error && (
              <pre className="text-red-300 text-xs mt-4 overflow-x-auto bg-black/30 p-3 rounded border border-red-900/50">
                {error}
              </pre>
            )}
          </div>

          {/* Counters */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30">
              <p className="text-davy-gray text-xs font-mono uppercase tracking-wider mb-3">
                Tenants registrados
              </p>
              <p className="text-5xl font-bold text-amber-brand">
                {tenantCount}
                <span className="text-2xl text-davy-gray ml-2">/ {EXPECTED_TENANTS}</span>
              </p>
              <p className="text-xs text-davy-gray mt-3">
                MetricPress, InvestigaPress, Dreamoms, Never Alone Again, De Cero a Cien,
                Expande Digital, Código Maestro Soberano
              </p>
            </div>
            <div className="bg-space-cadet rounded-lg p-6 border border-davy-gray/30">
              <p className="text-davy-gray text-xs font-mono uppercase tracking-wider mb-3">
                Plantillas disponibles
              </p>
              <p className="text-5xl font-bold text-amber-brand">
                {templateCount}
                <span className="text-2xl text-davy-gray ml-2">/ {EXPECTED_TEMPLATES}</span>
              </p>
              <p className="text-xs text-davy-gray mt-3">
                Prensa (4) · Opinión (3) · Institucional (5) · Académico (1)
              </p>
            </div>
          </div>

          {/* Init alert */}
          {needsInit && tablesExist && (
            <div className="bg-amber-brand/10 border border-amber-brand rounded-lg p-6">
              <p className="font-bold text-amber-brand mb-2">
                ⚠ Base de datos vacía
              </p>
              <p className="text-sm mb-3">
                Las tablas existen pero no hay datos cargados. Tenés que correr el seed
                inicial.
              </p>
              <code className="block bg-black/30 p-3 rounded text-amber-brand text-xs font-mono break-all">
                POST /api/admin/init?token=TU_ADMIN_TOKEN
              </code>
            </div>
          )}

          {dbStatus === 'error' && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-6">
              <p className="font-bold text-red-400 mb-2">⚠ Tablas no inicializadas</p>
              <p className="text-sm mb-3">
                La conexión a Postgres funciona pero las tablas no existen. Hacé el primer
                init:
              </p>
              <code className="block bg-black/30 p-3 rounded text-red-300 text-xs font-mono break-all">
                POST /api/admin/init?token=TU_ADMIN_TOKEN
              </code>
            </div>
          )}

          {tenantCount === EXPECTED_TENANTS && templateCount === EXPECTED_TEMPLATES && (
            <div className="bg-green-900/20 border border-green-700 rounded-lg p-6">
              <p className="font-bold text-green-400 mb-1">✓ Cimientos completos</p>
              <p className="text-sm">
                Todos los tenants y plantillas están cargados. La Fase 0 está cerrada.
                Listos para Fase 1.
              </p>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-16 pt-8 border-t border-davy-gray text-davy-gray text-sm space-y-1">
          <p>Operador Técnico AI-Augmented: Cristian Jofré Donoso</p>
          <p className="font-mono text-xs">
            Next.js {process.env.npm_package_dependencies_next || '15'} · Drizzle · Postgres
            · Vercel · Railway
          </p>
        </footer>
      </div>
    </main>
  );
}
