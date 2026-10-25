# Espinal Guerra AI OS

Centro de control empresarial privado del grupo Espinal Guerra. Fase 1: fundación técnica, navegación y panel ejecutivo. No conecta sistemas comerciales, no ejecuta agentes ni automatizaciones y no modifica sistemas de producción.

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

## Despliegue futuro (no ejecutado)

1. Revisar el PR, aplicar y comprobar RLS en un proyecto Supabase autorizado para el destino.
2. Configurar ambas variables públicas en el proveedor antes del build, HTTPS y la URL del sitio en Supabase. No copiar `.env.local` al repositorio.
3. Ejecutar `npm ci`, las comprobaciones anteriores y `npm run build`.
4. Ejecutar `npm start` o usar un proveedor compatible con Next.js y App Router.
5. Verificar: usuario anónimo → login; usuario sin membresía → acceso pendiente; miembro autorizado → panel; cierre de sesión → rutas bloqueadas. Confirmar aislamiento con dos organizaciones antes de registrar datos reales.

No se ha desplegado esta aplicación ni se ha conectado una base de producción.

## Fase 1.1 · Legibilidad

La escala tipográfica está centralizada en `src/app/globals.css`: base 16 px, texto auxiliar mínimo 14 px, enlaces de marcas 15 px, navegación y controles 16 px, nombres de marcas 18 px, secciones 22 px y títulos principales de 28–34 px. Los tamaños se expresan en rem y respetan la preferencia tipográfica del navegador. Las tarjetas redistribuyen el contenido sin alturas rígidas; el menú móvil se activa también en tabletas.

Pruebas de presentación (después del build):

```bash
npx playwright install chromium
npm run test:ui
# Si Chromium ya está instalado en el sistema:
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

La prueba renderiza los componentes reales de los ocho módulos, inicio de sesión con error y configuración pendiente en una **vista aislada solo de pruebas**, a 320, 390, 768, 1024, 1440 y 1920 px. Comprueba tamaño mínimo, desbordamientos, áreas interactivas y pares de contraste AA (4.5:1), y guarda capturas en `test-results/legibility/`. Los adaptadores de navegación y acciones se sustituyen únicamente dentro del proceso de pruebas; no hay ruta de demostración ni cambios en la autenticación de la aplicación. La vista de prueba no conecta Supabase ni envía formularios. Las once pruebas HTTP existentes siguen verificando el bloqueo de las rutas privadas.

## Identidad corporativa oficial · Fase 1.1

Paleta: azul profundo `#0A1F44`, corporativo `#1E3A6D`, medio `#4A6FA5`, claro `#E6ECF4`, fondo `#F7F9FC` y texto `#2B2F33`. Se sustituyó la identidad morada por estos colores. El azul medio identifica bordes, iconos y selección; el texto activo usa azul corporativo sobre azul claro para conservar contraste AA.

Montserrat se usa en títulos, subtítulos y métricas; Poppins en cuerpo, menús, formularios y controles. Se distribuyen mediante paquetes Fontsource con licencias OFL, servidas desde la aplicación: no se contacta Google Fonts en ejecución ni durante el build. Pesos cargados: Montserrat 500/600/700 y Poppins 400/500/600/700. Escala actual: H1 32–40 px, H2 26–32 px, H3 20 px, cuerpo/menú/formularios 16 px, descripciones y enlaces 15–16 px, auxiliares desde 14 px. Esta escala sustituye la escala anterior documentada arriba.

`src/components/corporate-identity.tsx` centraliza el identificador. No se recibió el archivo gráfico original ni una imagen de referencia con la solicitud: se utiliza texto identificado como provisional, sin recrear el isotipo de alas. Cuando esté disponible el original autorizado, guárdalo en `public/brand/` y proporciona su ruta mediante `logoSrc` a `CorporateIdentity` en el sidebar y la pantalla de acceso. Mantén el original sin alteraciones y un contraste adecuado sobre fondo azul y blanco.

El panel añade bienvenida con el correo de la sesión ya disponible, accesos rápidos a módulos existentes, resumen comercial y estado operativo. Los nuevos bloques son estados vacíos, sin métricas ficticias, consultas o automatizaciones. Las pruebas de presentación verifican los diez espacios a seis anchos, la carga de ambas fuentes y nueve pares de contraste AA. Se conserva la barrera de autorización existente.
