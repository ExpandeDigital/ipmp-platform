/**
 * IP+MP Platform — Generador de Ángulos Noticiosos
 *
 * Página server-side que carga tenants y templates de la DB
 * y pasa los datos al componente interactivo del cliente.
 */

import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import AngulosClient from './AngulosClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Generador de Ángulos — IP+MP Platform',
};

export default async function AngulosPage() {
  // Cargar tenants activos
  const allTenants = await db
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.active, true))
    .orderBy(tenants.name);

  // Cargar templates activas
  const allTemplates = await db
    .select({
      slug: templates.slug,
      name: templates.name,
      family: templates.family,
      idPrefix: templates.idPrefix,
    })
    .from(templates)
    .where(eq(templates.active, true))
    .orderBy(templates.family, templates.name);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <header className="mb-8">
        <p className="text-amber-brand font-mono text-xs mb-2 uppercase tracking-wider">
          Herramienta 1 · Pipeline de Producción
        </p>
        <h1 className="text-3xl font-bold mb-2">Generador de Ángulos Noticiosos</h1>
        <p className="text-davy-gray text-sm max-w-2xl">
          Ingresá un tema o tesis y el sistema genera entre 5 y 8 ángulos periodísticos
          rankeados por tipo de medio, audiencia y nivel de riesgo.
        </p>
      </header>

      <AngulosClient tenants={allTenants} templates={allTemplates} />
    </div>
  );
}
