# IP+MP PLATFORM — DOCUMENTO MAESTRO DE ESTADO
## Última actualización: 10 de abril de 2026 — Cierre Fase 0

---

## 1. IDENTIDAD DEL PROYECTO

**Nombre**: IP+MP Platform (InvestigaPress + MetricPress)
**Descripción**: Pipeline de investigación periodística y producción de contenido medible con IA
**Propietario legal**: Expande Digital Consultores SpA
**Operador técnico**: Cristian Jofré Donoso — Operador Técnico AI-Augmented (Chile)
**CTO virtual**: Claude Opus 4.6 (Anthropic) — Produce todo el código
**Rol de Ignacio Jofré Guerra**: Fuera del alcance de este proyecto
**Rol de Claudia Guerra Ávila**: Revisora editorial final de todo output. No participa en desarrollo técnico.

---

## 2. STACK TECNOLÓGICO

| Componente | Tecnología | Estado |
|---|---|---|
| Framework | Next.js 16.2.3 (App Router) | ✅ Deployed |
| Lenguaje | TypeScript | ✅ |
| Base de datos | PostgreSQL (Railway, plan Hobby USD 5/mes) | ✅ Online |
| ORM | Drizzle ORM | ✅ |
| Estilos | Tailwind CSS | ✅ |
| Hosting frontend | Vercel (plan Hobby gratuito) | ✅ Deployed |
| IA (Fase 1+) | Anthropic Claude API | ❌ Pendiente — crear cuenta en console.anthropic.com |
| Generación visual | Manus IM (externo, operado por Cristian) | ✅ Workflow propio ya calibrado |
| Repositorio | github.com/ExpandeDigital/ipmp-platform (privado) | ✅ |

**URLs de producción**:
- App: https://ipmp-platform.vercel.app
- Health: https://ipmp-platform.vercel.app/api/health
- Init (una sola vez): POST /api/admin/init?token=ADMIN_TOKEN

**Variables de entorno en Vercel**:
- `DATABASE_URL` → valor = DATABASE_PUBLIC_URL de Railway (la pública, no la interna)
- `ADMIN_TOKEN` → string aleatorio de 40 chars
- `ANTHROPIC_API_KEY` → pendiente Fase 1

---

## 3. ESTRUCTURA DEL HOLDING (TENANTS)

```
EXPANDE DIGITAL CONSULTORES SpA (vehículo legal madre)
│
├── MetricPress (Growth PR, slug: metricpress)
├── InvestigaPress (investigación periodística, slug: investigapress)
├── De Cero a Cien (SaaS emprendedores, slug: decero-a-cien)
├── Expande Digital (consultoría Humano-IA, slug: expande-digital)
├── Código Maestro Soberano (metodología/libro, slug: codigo-maestro-soberano)
│
SOCIEDAD DE INVERSIONES DREAMOMS SpA
│
├── Dreamoms (maternidad B2C, slug: dreamoms)
│   └── brand_variant: dreamoms-comunidad
│   └── brand_variant: dreamcare-territorial (B2B/B2G resiliencia)
├── Never Alone Again (soledad moderna, slug: never-alone-again)
```

**Total: 7 tenants cargados en la base de datos.**

---

## 4. PIPELINE IP+MP (FLUJO DE TRABAJO)

El pipeline no es un grid de herramientas sueltas. Es un proceso de fases:

```
1. VALIDACIÓN DE TESIS (InvestigaPress)
   └── VHP: Validar hipótesis, contrastar evidencia
2. PESQUISA Y EVIDENCIA (InvestigaPress)
   └── ODF: Organizar fuentes
   └── Importador de URLs (reemplazo honesto del "OSINT masivo")
3. PRODUCCIÓN DEL CONTENIDO (MetricPress)
   └── Generador de Ángulos Noticiosos (con Claude)
   └── Validador de Tono (con Claude)
   └── Constructor de Pitch (con Claude)
   └── Analizador de Sentimiento (con Claude)
   └── Etiquetador UTM (sin IA)
   └── Validador de Schema JSON-LD (sin IA)
   └── Scorer de Relevancia por Criterios (con Claude, reemplaza Calculadora DA)
   └── Core Web Vitals real (API PageSpeed, reemplaza simulador)
   └── Generador de Tareas QA (con Claude, baja prioridad)
   └── Validador SOLID (con Claude, uso interno técnico)
4. PRODUCCIÓN VISUAL
   └── Slots por plantilla, subida manual desde Manus IM
   └── Asset Library por tenant con versionado
   └── Metadata obligatoria (tipo, origen, alt text, declaración IA)
5. REVISIÓN (obligatoria antes de exportar)
   └── Express: para columnas, notas, cartas, minutas (puede aprobar Cristian)
   └── Profunda: para reportajes, investigaciones, asesorías legislativas (aprueba Claudia)
6. EXPORTACIÓN (5 botones de destino)
   └── Para Editor: mail pitch + .docx editable + GSV adjuntas
   └── Para Medios Propios: .html + imágenes + meta SEO + schema
   └── Para Redes: posts pre-escritos por red + imágenes en dimensiones correctas
   └── Para Tracking CTO: .csv con UTMs, pixels, eventos, keywords
   └── Empaquetado Interno: .zip completo con los 12 documentos
```

---

## 5. EMPAQUETADO (12 DOCUMENTOS POR PROJECT)

1. Documento periodístico (.docx editable)
2. Paquete de tracking backend (UTMs, pixels, eventos, keywords)
3. Documento de ángulos por tier/editor (usando base de datos de editores)
4. Emails de pitch personalizados por editor
5. Versiones PESO (Propios / Ganados / Pagados) del contenido
6. Quote Bank / Banco de citas (5-10 citas atribuibles)
7. Fact Sheet / Ficha de respaldo (datos duros, bios, fuentes)
8. Q&A Anticipado (8-12 preguntas probables con respuestas)
9. Pack de amplificación social (posts para LinkedIn/X/Instagram con UTMs)
10. Cronograma de follow-up (fechas y plantillas de re-pitch)
11. Checklist de QA pre-envío (schema, CWV, UTMs, links, imágenes)
12. Página de créditos y metadata (firma IP+MP, clasificación, ID, fecha)

---

## 6. PLANTILLAS DE PROJECT (13)

### Familia Prensa
| Plantilla | Prefijo | Clasificación default | Revisión |
|---|---|---|---|
| Reportaje en profundidad | RP | Confidencial / Uso Interno | Profunda |
| Nota de prensa / Comunicado | NP | Público | Express |
| Crónica narrativa | CR | Confidencial / Uso Interno | Profunda |
| Entrevista (Q&A) | EN | Confidencial / Uso Interno | Profunda |

### Familia Opinión
| Plantilla | Prefijo | Clasificación default | Revisión |
|---|---|---|---|
| Columna de opinión | CO | Público | Profunda |
| Editorial institucional | ED | Público | Profunda |
| Carta al director | CD | Público | Express |

### Familia Institucional
| Plantilla | Prefijo | Clasificación default | Revisión |
|---|---|---|---|
| Informe técnico | IT | Confidencial / Uso Interno | Profunda |
| **Asesoría Legislativa / Policy Brief** | **ASL** | **Institucional / Restringido** | **Profunda** |
| Investigación periodística forense | INV | Confidencial / Restringido | Profunda |
| White Paper | WP | Público | Profunda |
| Minuta ejecutiva | ME | Confidencial / Uso Interno | Express |

### Familia Académico
| Plantilla | Prefijo | Clasificación default | Revisión |
|---|---|---|---|
| Paper académico | AC | Académico | Profunda |

**Formato de ID**: `TENANT-PREFIJO-AÑO-NÚMERO` (ej: `DREAMOMS-RP-2026-0001`)

---

## 7. SISTEMA VISUAL

**Generación**: externa en Manus IM (Cristian opera). La plataforma solo recibe, organiza y empaqueta.
**5 tipos de pieza visual**: Hero narrativa / Still de marca / Visual científico-editorial / GSV (placa citable) / Infografía de datos
**Jerarquía de semillas**: Global → Tenant → Plantilla (como guía visible al operador, no inyección automática)
**Declaración IA**: automática en metadatos y créditos ("Material visual asistido por IA en Manus IM, revisado por [revisor]")

**Semilla Global**: Hyper-realistic 8k photography, cinematic, deep navy blue (#0A192F) and golden amber (#FBBF24), atmospheric lighting

**Avatares canónicos**:
- Avatar femenino 30-35 años latinoamericano → Dreamoms, Dreamcare, DECEROACIEN, Never Alone Again
- Avatar masculino 40-50 años latinoamericano → Código Maestro Soberano, MetricPress (contextos senior)
- Todos generados con consistencia facial en Manus IM

---

## 8. REGLAS DE BLINDAJE

- **Código Maestro Soberano**: NUNCA mencionar a Ignacio en outputs. Tratar como metodología, no testamento personal.
- **Asesoría Legislativa**: toda referencia normativa marcada con [VERIFICAR]. Paso de verificación humana obligatorio.
- **Imágenes IA**: declararlas siempre. No representan personas reales.
- **API key de Anthropic**: NUNCA en frontend, NUNCA en chat, NUNCA en GitHub. Solo en variables de entorno de Vercel.
- **Prompts y metodología**: propiedad intelectual de Expande Digital. Secreto comercial.
- **Capa de abstracción de modelo**: el código no llama directo a Claude, llama a función interna que hoy usa Claude pero mañana puede cambiar.

---

## 9. FILOSOFÍA OPERATIVA

- **PESO**: Medios Propios / Ganados / Pagados — cada activo se piensa en las tres dimensiones
- **"No vendemos clipping, medimos ROI"** — filosofía MetricPress
- **"No suites infladas, no falsas promesas, no infringir marcos legales"** — criterio de filtro de herramientas
- **Volumen esperado**: 6-8 Projects por mes (1-2 por semana)
- **Costo infraestructura mensual estimado**: USD 30-70 (Railway + Vercel + Claude API)
- **Deuda operativa que reemplaza**: ~USD 10.000/mes (equivalente a 3-5 profesionales mid-senior)

---

## 10. HERRAMIENTAS PROPUESTAS (NUEVAS, NO EN PROTOTIPOS ORIGINALES)

- **Briefing Inteligente de Cliente** — notas crudas de reunión → brief estructurado con Claude
- **Generador de Reporte Mensual** — datos reales del cliente → reporte mensual redactado por Claude

---

## 11. BASE DE DATOS (8 TABLAS)

| Tabla | Función |
|---|---|
| tenants | Marcas/unidades del holding |
| users | Operadores, revisores, admin |
| templates | Las 13 plantillas de Project |
| projects | Unidad de trabajo del pipeline |
| assets | Piezas visuales por Project |
| revisions | Log de revisiones de Claudia/revisores |
| exports | Audit trail de exportaciones |
| consumption_logs | Tracking de consumo Claude API por tenant |

---

## 12. ESTADO DE FASES

| Fase | Estado | Descripción |
|---|---|---|
| **Fase 0: Cimientos** | ✅ COMPLETADA | Repo, DB, tenants, plantillas, deploy automático |
| **Fase 1: Pipeline IP+MP** | ❌ PENDIENTE | Herramientas con Claude, Project flow, Empaquetado, Exportación |
| **Fase 2: Iteración** | ❌ PENDIENTE | Herramientas marginales, conexiones externas, pulido |

**Próximo paso concreto**: crear cuenta Anthropic Console, cargar USD 20, construir Generador de Ángulos Noticiosos como primera herramienta real.

---

## 13. WORKFLOW DE DESARROLLO

1. Claude produce archivos en el chat
2. Cristian descarga y coloca en `C:\ipmp-platform\`
3. Cristian ejecuta: `git add .` → `git commit -m "mensaje"` → `git push`
4. Vercel deploya automáticamente
5. Si hay migraciones de DB o comandos especiales, Claude da el comando exacto

**Tres consolas PowerShell** (cuando haga falta desarrollo local):
- Consola 1: servidor de desarrollo (`npm run dev`)
- Consola 2: git y comandos generales
- Consola 3: según necesidad

---

*Documento de uso interno — Expande Digital Consultores SpA*
*No distribuir fuera del holding*
