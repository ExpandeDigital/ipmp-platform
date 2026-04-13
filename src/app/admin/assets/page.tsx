import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { asc } from 'drizzle-orm';
import AssetLibraryClient from './AssetLibraryClient';

export const metadata = { title: 'Asset Library — IP+MP Platform' };
export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const tenantsList = await db
    .select({ slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .orderBy(asc(tenants.name));

  return (
    <>
      <Nav current="assets" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-seasalt mb-2">
              Asset Library
            </h1>
            <p className="text-davy-gray text-sm">
              Biblioteca de assets por tenant con metadata obligatoria.
              Cada asset debe declarar origen, texto alternativo y si fue
              generado con inteligencia artificial.
            </p>
          </header>
          <AssetLibraryClient tenantsDisponibles={tenantsList} />
        </div>
      </main>
    </>
  );
}
