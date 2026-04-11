/**
 * IP+MP Platform — Navegación principal
 *
 * Barra de navegación superior para el operador.
 * Server component — no necesita estado.
 */

import Link from 'next/link';

interface NavProps {
  current?: string;
}

export default function Nav({ current }: NavProps) {
  const links = [
    { href: '/', label: 'Dashboard', id: 'dashboard' },
    { href: '/projects', label: 'Projects', id: 'projects' },
    { href: '/admin/editores', label: 'Editores', id: 'editores' },
  ];

  return (
    <nav className="bg-space-cadet border-b border-davy-gray/30 px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono text-amber-brand text-sm font-bold tracking-wider">
            IP+MP
          </Link>
          <div className="flex gap-1">
            {links.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className={`px-3 py-1.5 rounded text-sm transition-colors ${
                  current === link.id
                    ? 'bg-amber-brand/20 text-amber-brand'
                    : 'text-davy-gray hover:text-seasalt hover:bg-white/5'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
        <span className="text-davy-gray text-xs font-mono">FASE 1</span>
      </div>
    </nav>
  );
}
