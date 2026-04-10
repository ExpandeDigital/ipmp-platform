/**
 * IP+MP Platform — Vista Detalle de Project
 *
 * Server component wrapper.
 * Pasa el ID dinámico al client component.
 *
 * Ruta: /projects/[id]
 * Acepta UUID o publicId como parámetro
 */

import Nav from '@/components/Nav';
import ProjectDetailClient from './ProjectDetailClient';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <>
      <Nav current="projects" />
      <ProjectDetailClient projectId={id} />
    </>
  );
}
