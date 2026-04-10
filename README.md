# IP+MP Platform

**Pipeline de investigación periodística y producción de contenido medible**

Plataforma interna del holding **Expande Digital Consultores SpA** y **Sociedad de Inversiones Dreamoms SpA**. Sistematiza el flujo *Investigación → Producción → Empaquetado → Exportación* para producir activos comunicacionales (reportajes, asesorías legislativas, columnas, white papers) con calidad institucional y trazabilidad de ROI.

> **Estado actual: Fase 0 — Cimientos**
> Solo el shell, base de datos y semilla de configuración. Sin herramientas de IA aún.

---

## Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Lenguaje**: TypeScript
- **Base de datos**: PostgreSQL (Railway)
- **ORM**: Drizzle ORM
- **Estilos**: Tailwind CSS
- **Hosting**: Vercel
- **IA** (desde Fase 1): Anthropic Claude API

## Estructura de carpetas

```
ipmp-platform/
├── src/
│   ├── app/                    # Rutas y páginas (App Router)
│   │   ├── api/
│   │   │   ├── admin/init/     # POST: crea tablas y carga seed
│   │   │   └── health/         # GET: verifica conexión a DB
│   │   ├── layout.tsx          # Layout raíz
│   │   ├── page.tsx            # Homepage / status dashboard
│   │   └── globals.css         # Estilos globales (Tailwind)
│   └── db/
│       ├── schema.ts           # Schema Drizzle (8 tablas)
│       ├── init-sql.ts         # SQL crudo para crear tablas
│       ├── seed-data.ts        # 7 tenants + 13 plantillas iniciales
│       └── index.ts            # Cliente de base de datos
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.example                # Plantilla de variables de entorno
├── .gitignore
├── README.md                   # Este archivo
└── RUNBOOK.md                  # Manual operativo (lo que necesitás vos)
```

## Tenants iniciales

| Slug | Nombre | Entidad legal |
|---|---|---|
| `metricpress` | MetricPress | Expande Digital Consultores SpA |
| `investigapress` | InvestigaPress | Expande Digital Consultores SpA |
| `dreamoms` | Dreamoms (con variant `dreamcare-territorial`) | Sociedad de Inversiones Dreamoms SpA |
| `never-alone-again` | Never Alone Again | Sociedad de Inversiones Dreamoms SpA |
| `decero-a-cien` | De Cero a Cien | Expande Digital Consultores SpA |
| `expande-digital` | Expande Digital Consultores | Expande Digital Consultores SpA |
| `codigo-maestro-soberano` | Código Maestro Soberano | Expande Digital Consultores SpA |

## Plantillas iniciales (13)

**Familia Prensa**: Reportaje en profundidad · Nota de prensa · Crónica narrativa · Entrevista
**Familia Opinión**: Columna de opinión · Editorial institucional · Carta al director
**Familia Institucional**: Informe técnico · **Asesoría Legislativa** · Investigación forense · White Paper · Minuta ejecutiva
**Familia Académico**: Paper académico

## Cómo usar

Ver [RUNBOOK.md](./RUNBOOK.md) para instrucciones operativas paso a paso.

---

**Operador**: Cristian Jofré Donoso · Operador Técnico AI-Augmented
**Confidencialidad**: Uso interno del holding. No distribuir.
