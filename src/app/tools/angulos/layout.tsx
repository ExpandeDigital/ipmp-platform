/**
 * IP+MP Platform — Layout para sección de herramientas
 *
 * Envuelve todas las páginas /tools/* con la navegación.
 */

import Nav from '@/components/Nav';

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Nav current="angulos" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        {children}
      </main>
    </>
  );
}
