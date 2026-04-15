/**
 * IP+MP Platform — Dashboard del Operador
 *
 * Vista principal con estado del sistema y acceso a herramientas.
 * Evoluciona desde el "tablero de cimientos vivos" de Fase 0.
 */

import Link from 'next/link';
import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants, templates, projects, consumptionLogs } from '@/db/schema';
import { count, sum } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const EXPECTED_TENANTS = 7;
const EXPECTED_TEMPLATES = 13;

async function getSystemStatus() {
  try {
    const [tenantsResult] = await db.select({ count: count() }).from(tenants);
    const [templatesResult] = await db.select({ count: count() }).from(templates);
    const [projectsResult] = await db.select({ count: count() }).from(projects);
    const [usageResult] = await db
      .select({
        calls: count(),
        totalInput: sum(consumptionLogs.inputTokens),
        totalOutput: sum(consumptionLogs.outputTokens),
      })
      .from(consumptionLogs);

    return {
      dbStatus: 'ok' as const,
      tenantCount: Number(tenantsResult.count),
      templateCount: Number(templatesResult.count),
      projectCount: Number(projectsResult.count),
      apiCalls: Number(usageResult.calls),
      totalTokens: Number(usageResult.totalInput ?? 0) + Number(usageResult.totalOutput ?? 0),
      error: null,
    };
  } catch (error) {
    return {
      dbStatus: 'error' as const,
      tenantCount: 0,
      templateCount: 0,
      projectCount: 0,
      apiCalls: 0,
      totalTokens: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export default async function HomePage() {
  const status = await getSystemStatus();

  return (
    <>
      <Nav current="dashboard" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <header className="mb-10">
            <p className="text-amber-brand font-mono text-xs mb-2 uppercase tracking-wider">
              IP+MP Platform · v0.2.0 · FASE 1
            </p>
            <h1 className="text-4xl font-bold mb-2 tracking-tight">Dashboard del Operador</h1>
            <p className="text-davy-gray text-sm max-w-2xl">
              Pipeline de investigación periodística y producción de contenido medible.
              Expande Digital Consultores SpA.
            </p>
          </header>

          {/* Estado del sistema */}
          <section className="mb-10">
            <h2 className="text-xs font-mono text-davy-gray uppercase tracking-wider mb-4">
              Estado del Sistema
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-space-cadet rounded-lg p-4 border border-davy-gray/30">
                <p className="text-davy-gray text-xs font-mono mb-1">Postgres</p>
                <p className="text-lg font-bold">
                  {status.dbStatus === 'ok' ? (
                    <span className="text-green-400">Operativa</span>
                  ) : (
                    <span className="text-red-400">Caída</span>
                  )}
                </p>
              </div>
              <div className="bg-space-cadet rounded-lg p-4 border border-davy-gray/30">
                <p className="text-davy-gray text-xs font-mono mb-1">Tenants</p>
                <p className="text-lg font-bold text-amber-brand">
                  {status.tenantCount}
                  <span className="text-sm text-davy-gray ml-1">/ {EXPECTED_TENANTS}</span>
                </p>
              </div>
              <div className="bg-space-cadet rounded-lg p-4 border border-davy-gray/30">
                <p className="text-davy-gray text-xs font-mono mb-1">Plantillas</p>
                <p className="text-lg font-bold text-amber-brand">
                  {status.templateCount}
                  <span className="text-sm text-davy-gray ml-1">/ {EXPECTED_TEMPLATES}</span>
                </p>
              </div>
              <div className="bg-space-cadet rounded-lg p-4 border border-davy-gray/30">
                <p className="text-davy-gray text-xs font-mono mb-1">Llamadas IA</p>
                <p className="text-lg font-bold text-amber-brand">
                  {status.apiCalls}
                  {status.totalTokens > 0 && (
                    <span className="text-sm text-davy-gray ml-1">
                      · {(status.totalTokens / 1000).toFixed(1)}k tok
                    </span>
                  )}
                </p>
              </div>
            </div>
            {status.error && (
              <pre className="text-red-300 text-xs mt-3 overflow-x-auto bg-red-900/20 p-3 rounded border border-red-900/50">
                {status.error}
              </pre>
            )}
          </section>

          {/* Herramientas */}
          <section className="mb-10">
            <h2 className="text-xs font-mono text-davy-gray uppercase tracking-wider mb-4">
              Herramientas de Producción
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Generador de Ángulos */}
              <Link
                href="/tools/angulos"
                className="group bg-space-cadet rounded-lg p-6 border border-davy-gray/30 hover:border-amber-brand/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">◇</span>
                  <span className="text-xs font-mono text-green-400 bg-green-400/10 px-2 py-0.5 rounded">
                    ACTIVA
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-1 group-hover:text-amber-brand transition-colors">
                  Generador de Ángulos Noticiosos
                </h3>
                <p className="text-davy-gray text-sm">
                  Genera 5-8 ángulos periodísticos por tema, con tier de medio,
                  audiencia, tono y nivel de riesgo.
                </p>
              </Link>

              {/* Placeholder: Validador de Tono */}
              <div className="bg-space-cadet/50 rounded-lg p-6 border border-davy-gray/20 opacity-50">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">◇</span>
                  <span className="text-xs font-mono text-davy-gray bg-davy-gray/10 px-2 py-0.5 rounded">
                    PRÓXIMA
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-1">Validador de Tono</h3>
                <p className="text-davy-gray text-sm">
                  Analiza un borrador y valida que el tono sea consistente con
                  la marca del tenant.
                </p>
              </div>

              {/* Placeholder: Analizador de Sentimiento */}
              <div className="bg-space-cadet/50 rounded-lg p-6 border border-davy-gray/20 opacity-50">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">◇</span>
                  <span className="text-xs font-mono text-davy-gray bg-davy-gray/10 px-2 py-0.5 rounded">
                    PRÓXIMA
                  </span>
                </div>
                <h3 className="text-lg font-bold mb-1">Analizador de Sentimiento</h3>
                <p className="text-davy-gray text-sm">
                  Evalúa el sentimiento y la percepción pública de un texto o
                  cobertura mediática.
                </p>
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="pt-8 border-t border-davy-gray/30 text-davy-gray text-xs font-mono">
            <p>Operador Técnico AI-Augmented: Cristian Jofré Donoso</p>
            <p className="mt-1">Next.js · Drizzle · PostgreSQL · Vercel · Railway · Claude API</p>
          </footer>
        </div>
      </main>
    </>
  );
}
