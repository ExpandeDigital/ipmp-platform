# RUNBOOK — Manual Operativo IP+MP Platform

**Para**: Cristian Jofré Donoso, Operador Técnico AI-Augmented
**Versión**: Fase 0 — Cimientos
**Última actualización**: Abril 2026

---

## Requisitos previos en tu máquina

Antes de empezar, necesitás tener instalados estos tres programas. Si ya los tenés, saltá al Paso 1.

### A. Node.js (versión 20 o superior)

1. Andá a https://nodejs.org
2. Descargá la versión **LTS** (el botón verde grande de la izquierda)
3. Instalá con el instalador de Windows (siguiente, siguiente, finish)
4. Para verificar, abrí PowerShell y escribí:
   ```
   node --version
   ```
   Tiene que decir `v20.x.x` o superior. Si dice algo menor a 20, desinstalá y volvé a instalar.

### B. Git

1. Andá a https://git-scm.com/download/win
2. Descargá e instalá (dejar todo en defaults está bien)
3. Verificar en PowerShell:
   ```
   git --version
   ```

### C. Un editor de texto (opcional pero útil)

Si no tenés uno, bajate Visual Studio Code de https://code.visualstudio.com — solo para abrir archivos y revisar, no para escribir código.

---

## PASO 1: Crear el repositorio en GitHub

1. Andá a https://github.com y logueate (si no tenés cuenta, creá una)
2. Hacé click en el botón verde **"New"** (arriba a la izquierda) o andá directo a https://github.com/new
3. Completá:
   - **Repository name**: `ipmp-platform`
   - **Description**: `Pipeline de investigación periodística y producción de contenido medible`
   - **Visibility**: **Private** (MUY IMPORTANTE — este repo es confidencial)
   - **NO marques** "Add a README file" (ya tenemos uno)
   - **NO marques** "Add .gitignore" (ya tenemos uno)
4. Click en **"Create repository"**
5. GitHub te va a mostrar una página con instrucciones. **No cierres esa página.** Necesitás la URL del repo que aparece arriba, algo como:
   ```
   https://github.com/TU-USUARIO/ipmp-platform.git
   ```

---

## PASO 2: Subir los archivos al repo

Abrí PowerShell y ejecutá estos comandos **uno por uno**. Reemplazá `TU-USUARIO` por tu usuario de GitHub.

```powershell
# 1. Andá a la carpeta donde descomprimiste el ZIP que te di
cd C:\Users\TU-NOMBRE\Downloads\ipmp-platform

# 2. Inicializá git
git init

# 3. Agregá todos los archivos
git add .

# 4. Hacé el primer commit
git commit -m "Fase 0: cimientos — schema, seed, health, status dashboard"

# 5. Conectá con GitHub (reemplazá TU-USUARIO)
git remote add origin https://github.com/TU-USUARIO/ipmp-platform.git

# 6. Subí el código
git branch -M main
git push -u origin main
```

Si te pide credenciales de GitHub, ingresalas. Si te pide un "Personal Access Token" en vez de contraseña, seguí estas instrucciones: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens

**Verificación**: andá a `https://github.com/TU-USUARIO/ipmp-platform` en el browser. Tenés que ver todos los archivos listados.

---

## PASO 3: Crear la base de datos en Railway

1. Andá a https://railway.com y logueate (podés usar tu cuenta de GitHub)
2. En el dashboard, click en **"New Project"**
3. Elegí **"Provision PostgreSQL"**
4. Railway va a crear una base de datos Postgres en segundos
5. Hacé click en el servicio de Postgres que se creó
6. Andá a la pestaña **"Variables"** o **"Connect"**
7. Buscá la variable **`DATABASE_URL`** — copiala entera. Tiene este formato:
   ```
   postgresql://postgres:XXXXXX@XXXXX.railway.app:XXXX/railway
   ```
8. **Guardá esa URL en un lugar seguro** (gestor de contraseñas). La vas a necesitar en el siguiente paso.

**IMPORTANTE**: Railway tiene un plan gratuito con USD 5 de crédito/mes que alcanza de sobra para Fase 0. Si te pide tarjeta, es para verificar identidad, no te cobra hasta que superes el free tier.

---

## PASO 4: Conectar Vercel

1. Andá a https://vercel.com y logueate con tu cuenta de GitHub
2. Click en **"Add New..." → "Project"**
3. Vercel te va a mostrar tus repos de GitHub. Buscá **`ipmp-platform`** y hacé click en **"Import"**
4. En la pantalla de configuración:
   - **Framework Preset**: debería auto-detectar **Next.js**. Si no, elegilo manualmente.
   - **Root Directory**: dejá vacío (es la raíz)
   - **Build Command**: dejá el default (`next build`)
   - **Output Directory**: dejá el default
5. Antes de hacer click en "Deploy", expandí **"Environment Variables"** y agregá estas tres variables:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | (pegá la URL de Railway del paso anterior) |
   | `ADMIN_TOKEN` | (inventá un string aleatorio de 32+ caracteres — usá https://1password.com/password-generator/) |
   | `NEXT_PUBLIC_APP_URL` | (dejá vacío por ahora, Vercel lo maneja) |

6. Click en **"Deploy"**
7. Vercel va a instalar dependencias, compilar y deployar. Toma 1-3 minutos.
8. Al terminar, te va a dar una URL tipo `https://ipmp-platform-XXXX.vercel.app`

**Verificación**: abrí esa URL en el browser. Vas a ver la página "Cimientos vivos" con un error de conexión a base de datos (es esperado, las tablas no están creadas todavía).

---

## PASO 5: Inicializar la base de datos

Este paso crea las tablas y carga los 7 tenants + 13 plantillas.

Abrí PowerShell y ejecutá este comando. Reemplazá las dos partes:

```powershell
curl -X POST "https://TU-APP.vercel.app/api/admin/init?token=TU_ADMIN_TOKEN"
```

Donde:
- `TU-APP.vercel.app` es la URL que Vercel te dio en el paso anterior
- `TU_ADMIN_TOKEN` es el string aleatorio que pusiste como variable de entorno en Vercel

**Respuesta esperada** (formato JSON):

```json
{
  "success": true,
  "log": [
    "🔨 Creando tablas...",
    "✅ Tablas creadas (idempotente)",
    "🌱 Insertando tenants...",
    "✅ 7 tenants procesados",
    "🌱 Insertando plantillas...",
    "✅ 13 plantillas procesadas",
    "",
    "🎉 Cimientos inicializados correctamente."
  ]
}
```

Si ves ese JSON con `"success": true`, la base de datos está lista.

**Verificación final**: volvé a abrir la URL de Vercel en el browser. Ahora la página "Cimientos vivos" debería mostrar:
- Conexión Postgres: **Operativa** (punto verde)
- Tenants registrados: **7 / 7** (en amarillo/dorado)
- Plantillas disponibles: **13 / 13** (en amarillo/dorado)
- Mensaje verde: **"✓ Cimientos completos. Listos para Fase 1."**

Si ves todo eso, **Fase 0 está cerrada**. La plataforma existe, está viva, tiene base de datos con los cimientos del holding cargados, y deployea automáticamente cada vez que pusheás a GitHub.

---

## PASO 6: Verificar el deploy automático (prueba rápida)

Para confirmar que el pipeline GitHub → Vercel funciona:

1. Andá a tu carpeta local `ipmp-platform`
2. Abrí el archivo `README.md` con cualquier editor de texto
3. Agregá una línea al final: `<!-- test deploy -->`
4. Guardá
5. En PowerShell:
   ```powershell
   cd C:\Users\TU-NOMBRE\Downloads\ipmp-platform
   git add .
   git commit -m "test: verificar deploy automático"
   git push
   ```
6. Andá a https://vercel.com/dashboard — vas a ver que arrancó un nuevo deploy automáticamente
7. Cuando termine (1-2 min), la URL se actualiza sola

Si eso funcionó, el workflow está completo. A partir de ahora, cada vez que yo te entregue archivos nuevos, vos los ponés en la carpeta, hacés `git add . && git commit -m "mensaje" && git push`, y Vercel deploya solo.

---

## Procedimientos de emergencia

### La página muestra "Error de conexión a base de datos"

1. Andá a https://railway.com → tu proyecto → el servicio Postgres
2. Verificá que esté corriendo (punto verde)
3. Si está parado, hacé click en "Restart"
4. Si sigue sin funcionar, verificá que la variable `DATABASE_URL` en Vercel coincida exactamente con la de Railway (copiá de nuevo y pegá)

### Necesito revocar el ADMIN_TOKEN

1. Andá a Vercel → tu proyecto → Settings → Environment Variables
2. Buscá `ADMIN_TOKEN` y editalo con un nuevo string aleatorio
3. Hacé click en "Redeploy" en la pestaña Deployments (con el botón de los tres puntos del deploy más reciente → Redeploy)
4. Desde ese momento, el token viejo deja de funcionar

### Necesito ver los logs del servidor

1. Andá a Vercel → tu proyecto → Deployments → click en el deploy más reciente
2. Pestaña "Functions" o "Logs" — ahí ves todo lo que pasa en las API routes

### La URL de Vercel muestra "404" o "Application Error"

1. Andá a Vercel → tu proyecto → Deployments
2. Buscá el deploy más reciente — ¿tiene un check verde o una X roja?
3. Si tiene X roja, hacé click para ver el log de error. Copiá el error y traémelo al chat.

---

## Próximos pasos (Fase 1 — cuando yo te avise)

1. Crear cuenta en https://console.anthropic.com (te guío paso a paso cuando lleguemos)
2. Cargar USD 20 de saldo
3. Crear API key `ipmp-dev`
4. Agregar la variable `ANTHROPIC_API_KEY` en Vercel
5. Yo te entrego los archivos de la primera herramienta (Generador de Ángulos Noticiosos)
6. Vos los ponés en la carpeta, push, Vercel deploya, probamos con Claude real

**No hagas nada de esta lista hasta que yo te lo pida.** Fase 0 termina cuando la página de cimientos muestra todo en verde.

---

**Fin del RUNBOOK — Fase 0**
