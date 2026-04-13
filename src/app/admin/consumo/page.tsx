import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { asc } from 'drizzle-orm';
import ConsumoClient from './ConsumoClient';

export const metadata = { title: 'Dashboard de Consumo — IP+MP Platform' };
export const dynamic = 'force-dynamic';

export default async function ConsumoPage() {
  const tenantsList = await db
    .select({ id: tenants.id, slug: tenants.slug, name: tenants.name })
    .from(tenants)
    .orderBy(asc(tenants.name));

  const adminToken = process.env.ADMIN_TOKEN ?? '';

  return (
    <>
      <Nav current="consumo" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-seasalt mb-2">
              Dashboard de Consumo
            </h1>
            <p className="text-davy-gray text-sm">
              Tokens y costo estimado por tenant, herramienta y mes
            </p>
          </header>
          <ConsumoClient
            tenantsDisponibles={tenantsList}
            adminToken={adminToken}
          />
        </div>
      </main>
    </>
  );
}
