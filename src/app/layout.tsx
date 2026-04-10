import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IP+MP Platform — Expande Digital Consultores',
  description: 'Pipeline de investigación periodística y producción de contenido medible',
  robots: 'noindex, nofollow',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
