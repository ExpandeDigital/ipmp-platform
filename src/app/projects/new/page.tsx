/**
 * IP+MP Platform — Crear nuevo Project
 *
 * Formulario para iniciar un nuevo Project en el pipeline.
 */

import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants, templates } from '@/db/schema';
import { eq } from 'drizzle-orm';
import NewProjectClient from './NewProjectClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Nuevo Project — IP+MP Platform',
};

export default async function NewProjectPage() {
  const allTenants = await db
    .select({
      slug: tenants.slug,
      name: tenants.name,
      brandVariants: tenants.brandVariants,
    })
    .from(tenants)
    .where(eq(tenants.active, true))
    .orderBy(tenants.name);

  const allTemplates = await db
    .select({
      slug: templates.slug,
      name: templates.name,
      family: templates.family,
      idPrefix: templates.idPrefix,
      reviewLevel: templates.reviewLevel,
      defaultClassification: templates.defaultClassification,
    })
    .from(templates)
    .where(eq(templates.active, true))
    .orderBy(templates.family, templates.name);

  return (
    <>
      <Nav current="projects" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-3xl mx-auto px-6 py-8">
          <header className="mb-8">
            <a
              href="/projects"
              className="text-davy-gray text-xs font-mono hover:text-seasalt transition-colors"
            >
              ← Volver a Projects
            </a>
            <h1 className="text-3xl font-bold mt-3 mb-2">Nuevo Project</h1>
            <p className="text-davy-gray text-sm">
              Seleccioná tenant, plantilla y definí el tema. El sistema genera el ID automáticamente.
            </p>
          </header>

          <NewProjectClient tenants={allTenants} templates={allTemplates} />
        </div>
      </main>
    </>
  );
}
