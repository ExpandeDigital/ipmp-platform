import Nav from '@/components/Nav';
import { db } from '@/db';
import { tenants, editoresAgenda } from '@/db/schema';
import { asc } from 'drizzle-orm';
import EditoresClient from './EditoresClient';

export const metadata = { title: 'Agenda de Editores — IP+MP Platform' };
export const dynamic = 'force-dynamic';

// Nota arquitectonica: la query de tenants NO filtra por active=true.
// Se incluyen todos los tenants (activos e inactivos) para que si un editor
// esta asociado a un tenant inactivo, el checkbox siga apareciendo y se
// pueda desasociar desde el form. Filtrado visual es responsabilidad del
// operador.
export default async function EditoresPage() {
  const [tenantsList, editoresList] = await Promise.all([
    db
      .select({ slug: tenants.slug, name: tenants.name })
      .from(tenants)
      .orderBy(asc(tenants.name)),
    db
      .select()
      .from(editoresAgenda)
      .orderBy(asc(editoresAgenda.tier), asc(editoresAgenda.apellido)),
  ]);

  // Serializar timestamps Date -> ISO string para que el shape matchee
  // con el shape del API (JSON, sin Date). El Client declara los campos
  // como string y las respuestas PATCH/POST del API ya vienen asi.
  const editoresSerializados = editoresList.map((e) => ({
    ...e,
    ultimaVerificacion: e.ultimaVerificacion
      ? e.ultimaVerificacion.toISOString()
      : null,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  }));

  return (
    <>
      <Nav current="editores" />
      <main className="min-h-screen bg-oxford-blue text-seasalt">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-seasalt mb-2">
              Agenda de Editores
            </h1>
            <p className="text-davy-gray text-sm">
              Base manual de editores y periodistas para media relations
              del holding. Uso interno. Datos verificados por el operador.
            </p>
          </header>
          <EditoresClient
            tenantsDisponibles={tenantsList}
            editoresIniciales={editoresSerializados}
          />
        </div>
      </main>
    </>
  );
}
