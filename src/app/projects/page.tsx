/**
 * IP+MP Platform — Lista de Projects
 *
 * Muestra todos los Projects del pipeline con su estado actual.
 */

import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import ProjectsClient from './ProjectsClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Projects — IP+MP Platform',
};

export default async function ProjectsPage() {
  const allTenants = await db
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .where(eq(tenants.active, true))
    .orderBy(tenants.name);

  return (
    <>
      <Nav current="projects" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-8 flex items-start justify-between">
            <div>
              <p className="text-amber-brand font-mono text-xs mb-2 uppercase tracking-wider">
                Pipeline IP+MP
              </p>
              <h1 className="text-3xl font-bold mb-2">Projects</h1>
              <p className="text-davy-gray text-sm">
                Unidades de trabajo del pipeline. Cada project avanza por fases hasta la exportación.
              </p>
            </div>
            <a
              href="/projects/new"
              className="bg-amber-brand text-oxford-blue px-4 py-2.5 rounded font-bold text-sm hover:bg-amber-brand/90 transition-colors shrink-0"
            >
              + Nuevo Project
            </a>
          </header>

          <ProjectsClient tenants={allTenants} />
        </div>
      </main>
    </>
  );
}
