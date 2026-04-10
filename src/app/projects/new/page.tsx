/**
 * IP+MP Platform — Crear nuevo Project (InvestigaPress)
 *
 * REFACTORIZACIÓN 5c (Abril 2026):
 *   - Simplificado: no necesita cargar tenants ni templates del servidor
 *   - El project nace solo con título + tesis
 */

import Nav from '@/components/Nav';
import NewProjectClient from './NewProjectClient';

export const metadata = {
  title: 'Nuevo Project — IP+MP Platform',
};

export default function NewProjectPage() {
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
              Definí el tema y la tesis. El sistema arranca en modo InvestigaPress — sin marca, periodismo limpio.
            </p>
          </header>

          <NewProjectClient />
        </div>
      </main>
    </>
  );
}
