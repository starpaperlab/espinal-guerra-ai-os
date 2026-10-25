# Espinal Guerra AI OS

Centro de control empresarial privado del grupo Espinal Guerra. Fase 1: fundación técnica, navegación y panel ejecutivo. No conecta sistemas comerciales, no ejecuta agentes ni automatizaciones.

## Requisitos e instalación

- Node.js 22.13 o posterior (validado con Node 24), npm 11.
- Proyecto Supabase **de desarrollo autorizado**, necesario para acceder al área privada.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Completa `.env.local` con la URL HTTPS y la clave pública real de tu proyecto:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No guardes credenciales en Git. No uses `service_role`, claves secretas ni una base de producción. Las dos variables públicas identifican el proyecto; la protección de datos depende de autenticación, membresías y RLS. Reinicia desarrollo o reconstruye tras cambiar la configuración.

Sin configuración válida, todas las rutas privadas redirigen a `/configuracion-pendiente`; no existe modo público ni bypass de demostración.

## Supabase y autorización

1. En un proyecto de desarrollo vacío y autorizado, ejecuta `supabase/migrations/202610250001_foundation.sql` desde el editor SQL o mediante tu proceso de migraciones. No se aplica automáticamente.
2. Desactiva el registro público en Authentication → Providers/Email y configura las políticas de contraseña y límites de autenticación. La aplicación no ofrece registro público.
3. Crea o invita al primer usuario autorizado desde Supabase y establece su contraseña mediante el flujo oficial de Supabase.
4. Desde el editor SQL, crea una organización y asigna el UUID real del usuario a `organization_members` con el UUID de esa organización y rol `owner`. No se generan usuarios, contraseñas ni membresías ficticias.
5. Accede por `/login`. Un usuario autenticado sin membresía verificable verá `/acceso-pendiente`.

La migración activa RLS y solo permite lecturas a miembros. Los usuarios no pueden crear ni cambiar sus permisos desde el cliente. Para comprobar aislamiento antes de usar datos reales: crea dos organizaciones y dos usuarios de prueba autorizados; verifica con cada sesión que las consultas a `organizations`, `organization_members` y `brands` no devuelvan filas de la otra organización, y que INSERT/UPDATE/DELETE con clave pública sean rechazados. No otorgues permisos de escritura generales para evitar estas restricciones.

Cada página privada y su layout llaman a la misma verificación de sesión y membresía en el servidor. `proxy.ts` renueva cookies; no es la única barrera de autorización. Los errores de membresía bloquean acceso. Las futuras acciones, endpoints y consultas deben volver a autorizar y filtrar por `organization_id` y por marca; nunca confiar en IDs enviados por el navegador. Los roles se almacenan, pero esta fase no ofrece operaciones privilegiadas ni administración de permisos en la UI.

## Funcionalidad de esta fase

- Panel ejecutivo responsive, menú móvil, encabezado y navegación en español.
- Módulos: Dashboard, Marcas, Ventas y CRM, Marketing, Operaciones, Finanzas, Tecnología y Configuración.
- Selector de marca conservado mediante `?marca=` y enlaces de navegación.
- Catálogo editorial: CEO Rentable OS, PlannerLab, Star Paper Lab y Emprendedora Digital con IA.
- Ventas, prospectos y operaciones sin cifras ficticias: aparecen como datos no conectados.
- Inicio y cierre de sesión Supabase, protección por membresía de organización.
- Contratos para futuras integraciones; no hay conexiones n8n, Sheets, GitHub o comerciales.

El catálogo es estático y compartido como información inicial del producto; no representa marcas cargadas desde la tabla `brands`. El selector cambia el contexto visual del catálogo, no consulta ni modifica registros operativos. Las tablas preparan el aislamiento multiempresa para futuras fases. Si un usuario pertenece a más de una organización, esta fase verifica una membresía disponible; todavía no ofrece selector de organización ni consultas operativas entre organizaciones.

## Arquitectura

```text
src/app/(private)/       Layout protegido y rutas de módulos
src/app/login/           Acceso y acciones de sesión del servidor
src/components/         Shell corporativo y componentes visuales
src/modules/catalog.ts  Catálogo inicial de módulos y marcas
src/lib/auth.ts         Verificación central de sesión y membresía
src/lib/supabase/        Configuración y cliente exclusivo de servidor
src/proxy.ts            Renovación de sesión mediante cookies
src/integrations/       Contratos sin conectividad ni automatizaciones
supabase/migrations/    Esquema inicial y políticas RLS
 tests/                 Pruebas HTTP de bloqueo sin configuración
```

No agregues caché compartida para datos privados; las rutas privadas son dinámicas. La organización debe formar parte de toda consulta futura. No añadas secretos de integraciones hasta implementar y autorizar su uso.

## Comprobaciones

```bash
npm run typecheck
npm run lint
npm run build
npm test
```

Las pruebas HTTP levantan temporalmente el build de producción en el puerto 3187 y verifican que las ocho rutas privadas y el login bloqueen acceso sin configuración, además de la pantalla pendiente y cabeceras de seguridad. No requieren credenciales ni contactan Supabase. Ejecuta estas pruebas con un build sin variables Supabase, como en esta fase. La autenticación completa, las cookies de sesión y las políticas SQL requieren validación con un proyecto real autorizado; no se presentan como probadas sin ese proyecto.

## Identidad corporativa · Fase 1.2

`src/config/corporate-identity.ts` centraliza nombre de empresa, nombre comercial, eslogan, `logoPrincipal`, `logoWhite`, paleta, tipografías y opciones de visualización. El documento aplica las variables CSS desde esa misma configuración; los componentes no duplican rutas de logos. Montserrat (títulos y métricas) y Poppins (texto y controles) se sirven localmente mediante Fontsource, con licencia OFL y sin llamadas a Google Fonts.

Paleta oficial: `#0A1F44`, `#1E3A6D`, `#4A6FA5`, `#E6ECF4`, `#F7F9FC` y `#2B2F33`, además de blanco y rojo semántico para errores. H1 32–40 px, H2 26–32 px, H3 20 px, cuerpo/menú/controles 16 px, descripciones y enlaces 15–16 px, auxiliares desde 14 px. Los textos activos usan azul corporativo sobre azul claro para contraste AA.

`CorporateIdentity` selecciona la variante blanca en el sidebar y la principal en fondos claros. Si el archivo falta o falla, conserva una identificación textual discreta. No se aplican filtros ni se reconstruye el isotipo. Se puede controlar la anchura, altura, eslogan y etiqueta provisional desde la configuración.

Archivos oficiales pendientes:

- `public/brand/espinal-guerra-logo.png`: original en color, para fondos claros.
- `public/brand/espinal-guerra-logo-white.png`: original blanco con transparencia real, para fondo azul.
- `public/brands/ceo-rentable-os.png`
- `public/brands/plannerlab.png`
- `public/brands/star-paper-lab.png`
- `public/brands/emprendedora-digital-con-ia.png`

No se encontraron archivos gráficos oficiales en el repositorio. Las imágenes mostradas en el chat no están disponibles como archivos binarios en el checkout; no se han extraído ni recreado versiones aproximadas. Consulta [la guía corporativa](public/brand/README.md) y [la guía de marcas](public/brands/README.md). Se admite PNG y SVG original de confianza cambiando únicamente las rutas en la configuración o el catálogo. No incluyas imágenes base64.

## Portafolio de marcas

`BrandPortfolio` genera una sola cuadrícula responsive por página, reutilizada en Dashboard y Marcas. Reemplaza las dos cuadrículas repetidas anteriores y conserva nombre, descripción, estado editorial y enlace a cada espacio. `src/modules/catalog.ts` es el catálogo único con `id`, `slug`, `name`, `description`, `status`, `logo`, `href` e iniciales. Agregar una marca allí amplía automáticamente la cuadrícula y el selector. No cambia consultas ni datos empresariales.

`BrandLogo` usa `next/image` y `object-fit: contain`: mantiene las iniciales mientras carga o si falla, sin recortar ni deformar las imágenes. Al cambiar la ruta se reinicia su estado. Los logos no están representados por imágenes ficticias.

## Pruebas de presentación

Después del build:

```bash
npx playwright install chromium
npm run test:ui
# Alternativa para Chromium ya instalado:
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

Las pruebas renderizan los ocho módulos, login con error y configuración pendiente a 320, 390, 768, 1024, 1440 y 1920 px: 60 combinaciones. Verifican fuentes, tamaños, desbordamientos, áreas clicables, cuatro marcas sin cuadrícula duplicada, foco de teclado y nueve pares de contraste AA. Guardan capturas en `test-results/legibility/`.

También comprueban carga/error de imágenes, cambio de fuente y selección corporativa clara/oscura sin filtros. Se usan formas geométricas solo en la memoria del navegador de pruebas; no se publican como logotipos. Las vistas aíslan navegación y acciones únicamente en las pruebas: no existe un bypass público de autenticación. Las pruebas no validan un inicio de sesión real ni datos de Production.

## Integración y Production

El proyecto Vercel existente debe desplegar desde `main`; no crear otro proyecto ni usar Promote como sustituto de la integración. Después de las comprobaciones, integrar los cambios mediante un push normal permitido por la política del repositorio o mediante el PR existente si la protección lo exige. Nunca forzar la rama ni omitir controles de GitHub.

La URL enlazada desde el repositorio es `https://espinal-guerra-ai-os.vercel.app`. La usuaria también proporcionó `https://espinal-guerra-ai-ilc8va1qt-maribelkeena-3132s-projects.vercel.app` como URL del despliegue actual. No asumir que un despliegue con URL inmutable se actualiza cuando cambia `main`: verificar el nuevo commit y la asignación Production en Vercel.

Verificar después de integrar:

1. GitHub: `main` contiene el commit validado y las comprobaciones requeridas pasan.
2. Vercel: proyecto existente → Deployments → despliegue asociado al nuevo commit de `main` → **Ready**, asignado a **Production**.
3. Abrir la URL Production; comprobar login con la cuenta real autorizada y visualización de las cuatro marcas. Cerrar sesión y confirmar que las rutas privadas vuelven a estar bloqueadas.
4. Revisar que las marcas y datos preexistentes siguen presentes. No crear usuarios ni modificar Supabase para hacer esta verificación.

Un build local correcto o un push aceptado no prueban que Vercel esté Ready. Si no hay acceso a Vercel o una sesión real autorizada, registrar la limitación y completar esa comprobación manualmente; no declarar autenticación ni datos de Production verificados.

Esta fase termina los ajustes visuales. Ventas/CRM, inteligencia artificial y automatizaciones corresponden a la Fase 2 y no se implementan aquí.
