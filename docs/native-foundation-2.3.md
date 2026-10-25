# Fase 2.3 · Empresa única, fuentes multimarcas y base nativa

## Estado real y auditoría

El estado conocido por el repositorio corresponde a migraciones hasta la 005; la administradora confirmó que la 005 está aplicada y que el CRM guarda registros. No hay conexión SQL ni credenciales Supabase inyectadas en esta máquina, así que **no se ha leído el estado vivo de organizations, organization_members o brands**. La administradora eligió ejecutar la auditoría manualmente. No confundir pruebas locales con una modificación efectiva de Production.

Ejecutar `docs/sql/automation-audit.sql` en **Supabase → proyecto espinal-guerra-ai-os → SQL Editor**. Devuelve un solo JSON con organizaciones, IDs/membresías, marcas, versión de captación y RLS, sin claves ni correos. Conservar el resultado para confirmar:

- La organización real y su ID, reutilizando la que ya contiene las marcas.
- La membresía owner/admin de la cuenta existente.
- Las cuatro marcas en esa misma organización.
- Si existe la marca corporativa Espinal Guerra.

No trasladar marcas ni registros CRM entre organizaciones para hacer coincidir nombres. Si hay ambigüedad o distribuciones diferentes, debe revisarse el resultado antes de corregir relaciones.

## Aplicación segura

1. Revisar la auditoría anterior. La versión 005 debe estar aplicada antes de la 006.
2. Ejecutar completo y una sola vez `supabase/migrations/202610250006_multibrand_native_foundation.sql` en el proyecto existente. Es transaccional y no crea organizaciones ni marcas por sí sola.
3. Ejecutar `docs/sql/enterprise-bootstrap.sql` como operador SQL autorizado. La llamada por defecto **no autoriza crear una organización** ni elevar permisos. Busca una organización reconocida no ambigua y su administrador existente; ante dudas se detiene.
4. Si el nombre difiere, pasar el UUID de organización auditado; si hay más de un administrador, pasar también el UUID confirmado en `p_admin`. Son identificadores de registros existentes, no claves secretas. Nunca usar IDs ficticios.
5. Revisar el JSON devuelto: `organization_id`, `organization_name`, `organization_created`, `admin_membership_confirmed`, `corporate_brand_created` y la lista de marcas con UUID. Este reporte, no el catálogo del código, establece qué existía y qué se agregó realmente.
6. Entrar en **Configuración** con la cuenta actual. Allí se consultan organización y marcas reales, fuentes autorizadas, borradores, cola e intentos. La opción de reconciliar desde la app requiere owner/admin y una vinculación inicial del operador ya existente; no permite que un usuario reclame por primera vez otra organización.

La función reutiliza los cuatro UUID existentes y agrega únicamente Espinal Guerra si falta. Acepta alias históricos reconocidos de slug/nombre solo para descubrir el registro existente; las relaciones guardadas siempre usan UUID. No normaliza ni sobrescribe los nombres o slugs actuales. Si detecta duplicados de identidad o marcas esperadas en otra organización, revierte esa llamada y pide revisión.

La estructura objetivo es **una organización** con cinco marcas:

1. Espinal Guerra (corporativa).
2. CEO Rentable OS.
3. PlannerLab.
4. Star Paper Lab.
5. Emprendedora Digital con IA.

No se borran marcas adicionales legítimas ni organizaciones preexistentes. El bootstrap es idempotente: repetirlo no crea otra empresa, marca, membresía, fuente o borrador.

Si la auditoría confirma que **no existe organización alguna del grupo**, se preparó una ruta explícita, exclusiva del operador SQL:

```sql
-- Solo tras comprobar ausencia real y copiar el UUID del administrador ya existente en Authentication → Users.
select public.crm_bootstrap_enterprise(
 p_admin => '<UUID real del administrador existente>'::uuid,
 p_allow_create => true
);
```

No ejecutar este caso por defecto. Si ya existen marcas en otra organización, la función se detiene para evitar una segunda empresa y no mueve datos. La elevación de una membresía faltante también requiere un parámetro explícito del operador (`p_grant_admin=true`); no está expuesta al cliente. No se crean usuarios ni se modifican contraseñas.

## Destino de captación resuelto en el servidor

`crm_enterprise_settings` guarda una única organización aprobada por el operador. `crm_capture_sources` relaciona cada clave de fuente con su **brand_id UUID y organization_id reales**, proveedor y estado de autorización. La vinculación inicial no puede crearse desde el navegador.

Desde Configuración, owner/admin puede registrar fuentes diferentes por formulario, campaña o integración. Se guardan deshabilitadas y se revisan antes de autorizar recepción. Cambiar de campaña o marca implica registrar otra fuente autorizada, **no cambiar cinco variables de Vercel**. El destino de una fuente existente es inmutable para no retargetear formularios ya publicados.

Captación desde un backend firmado, sin n8n:

`POST /api/integrations/capture/<source_key>`

El cuerpo canónico debe incluir `capture_source_key` con el mismo valor de la ruta, cubierto por la firma HMAC. La firma y los límites son los del receptor existente: X-CRM-Timestamp, X-CRM-Signature SHA-256 y cuerpo JSON exacto. El servidor valida fuente habilitada, proveedor `signed_backend`, organización empresarial vinculada y UUID de marca. Un `organization_id` enviado por el cliente se rechaza. Un `brand_id` opcional que contradiga la fuente también se rechaza. El backend llamante debe asignar la fuente desde su configuración autorizada, no copiar una marca o fuente libre de un formulario sin validación.

n8n conserva su ruta:

`POST /api/integrations/n8n/leads`

También admite `capture_source_key`, resolviéndolo en la misma base con proveedor `n8n`. El helper acepta una fuente configurada por integración/campaña, sin Brand ID fijo; su valor es un selector **no secreto** que el servidor valida, nunca autorización por sí mismo. Si se utiliza el helper de n8n, `CRM_CAPTURE_SOURCE_KEY` es solo un valor por defecto opcional de esa instancia, no una variable obligatoria de Vercel. Las nuevas campañas pueden asignar su clave en el paso autorizado que prepara cada captura.

Por compatibilidad, un envío antiguo con `brand_id` y sin fuente todavía usa `CRM_WEBHOOK_ORGANIZATION_ID`. No se eliminó ese código ni se recomienda borrar una variable de una integración antigua que siga utilizándola. Si se migra a fuentes configuradas, no enviar a la vez un Brand ID antiguo que contradiga la fuente nueva.

La función SQL prefija las identidades externas con la fuente y separa proveedores. Reintentos iguales devuelven el mismo prospecto y no generan dos eventos nativos. No fusiona contactos por nombre o correo. Conserva las garantías y límites de IDs de origen descritos en las guías anteriores.

## Variables: qué es obligatorio ahora

Configurar en **Vercel → proyecto existente espinal-guerra-ai-os → Settings → Environment Variables**. No compartir valores en chat, logs o Git.

| Nombre exacto                          | Uso y obligatoriedad                                                                                                                           | De dónde obtenerlo                                                                         | Production / redeploy                                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Obligatoria para autenticación, CRM y gestión privada nativa; ya usada por la app                                                              | Proyecto Supabase existente → Settings/Data API → Project URL                              | Production; redeploy si cambia                                                                     |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Obligatoria para el cliente autenticado con RLS; no sustituir por service_role                                                                 | Proyecto existente → API Keys → Publishable key                                            | Production; redeploy si cambia                                                                     |
| `SUPABASE_SERVICE_ROLE_KEY`            | Opcional ahora. Solo hace falta al activar captación externa firmada; no para CRM autenticado, configuración o el outbox generado por triggers | Clave de servidor/service_role del mismo proyecto, desde API Keys autorizado               | Production si se activa recepción externa; redeploy al configurarla. Nunca navegador/n8n           |
| `CRM_WEBHOOK_SECRET`                   | Opcional ahora. Autentica recepción externa; se comparte solo con backend/n8n firmante autorizado                                              | Generar y almacenar en un gestor seguro, al menos 32 caracteres; no reutilizar contraseñas | Production si se activa recepción externa; redeploy al cambiarla                                   |
| `CRM_WEBHOOK_ORGANIZATION_ID`          | Solo compatibilidad con envíos n8n antiguos por UUID. No requerida para fuentes nuevas ni infraestructura nativa                               | UUID ya existente en organizations, confirmado en auditoría                                | Conservar si sigue usándose en legacy; redeploy si cambia. Una sola organización, no cinco valores |
| `CRM_BRAND_ID`                         | **No es utilizada por Vercel/app**. El helper antiguo de n8n aún puede leerla; no se quitó esa compatibilidad                                  | UUID de brands únicamente si sigue activo un helper legacy en n8n                          | No configurarla como requisito de Vercel. No borrar una copia de n8n si un nodo antiguo la usa     |

No hace falta añadir Resend, otro proveedor IA, credenciales n8n, claves por marca ni un cron para esta infraestructura. Las futuras claves y remitentes verificados se definirán cuando se implemente y pruebe el adaptador correspondiente. No se añadieron variables sin uso ni se consultan secretos de Resend/IA para presentar servicios como activos.

**Cambiar una fuente o su autorización en Supabase no requiere redeploy.** Las variables públicas y privadas reales ya existentes se conservan. El bloqueo 503 del receptor externo no impide usar el CRM manual ni generar eventos nativos mediante sesión autorizada.

## Infraestructura nativa implementada

Nuevas tablas con RLS:

- `crm_enterprise_settings`: vinculación única del grupo, solo operador inicial.
- `crm_capture_sources`: rutas autorizadas por marca, proveedor y esquema de formulario como datos.
- `native_automation_definitions`: condiciones y plan en borrador/pausa; **no admite estado activo**.
- `native_automation_events`: outbox persistente, fecha de disponibilidad, leases, idempotencia, límite de tres intentos y separación de pruebas.
- `native_automation_runs`: historial de intentos, finalización y códigos de error no sensibles.
- `crm_conversions`: estructura para registrar hechos de conversión verificables, con marca y procedencia de prueba heredadas; solo el servidor puede escribir.

Las altas nuevas de CRM, cambios reales de etapa y conversiones registradas generan eventos internos **en la misma transacción**. No se importan registros anteriores ni se generan eventos retroactivos. No hay llamadas a n8n para producir o consultar esa cola. Los roles autenticados no pueden marcar un evento como ejecutado ni reclamar trabajos; esas funciones son solo de servidor. Tokens de lease impiden completar un intento anterior cuando otro ya posee el evento. Las pruebas se excluyen por defecto de reclamación de trabajo.

Los esquemas de formulario y de condiciones son datos limitados/validados, no JavaScript a evaluar. Se prepararon contratos de proveedor para evaluación y email aprobado. **No hay renderer de formularios públicos, worker comercial activo, evaluador IA nuevo, cliente Resend, envío de emails, secuencias, prueba gratuita concedida ni suscripción automática.** Registrar un borrador o un evento no equivale a ejecutar una automatización. Los formularios de proveedor nativo permanecen deshabilitados hasta implementar su renderer y protección pública.

## Primer caso CEO Rentable: preparado, no duplicado

El bootstrap registra una sola fuente **deshabilitada** `ceo-rentable-diagnostico`, ligada al UUID de CEO Rentable OS ya existente, y un único borrador de recorrido:

Diagnóstico existente → CRM → evaluación → email de diagnóstico aprobado → invitación aprobada a prueba de **10 días** → seguimiento → suscripción/conversión.

No se implementa otro diagnóstico, otro formulario CEO, otro sistema de suscripciones ni otro proyecto. No se modifica el sitio o aplicación de CEO Rentable. El próximo desarrollo debe revisar y conectar sus contratos existentes, consentimientos, prueba gratuita y conversión real, no recrearlos en AI OS.

## Pendiente para activar automatizaciones comerciales

1. Confirmar auditoría viva y ejecutar bootstrap autorizado; verificar cinco UUID bajo la misma organización y membresía correcta.
2. Definir/aprovechar el contrato real del diagnóstico CEO existente y conectar su backend a la fuente firmada, si se activa esa captación.
3. Implementar un renderer de formularios solo cuando se necesite, con protección antiabuso/consentimiento; el esquema actual no publica formularios.
4. Implementar worker y motor de reglas con handlers reales y validación de definiciones. Hoy no hay un proceso consumiendo trabajos ni un endpoint cron abierto.
5. Elegir/conectar proveedor IA y Resend con remitente verificado, plantillas/consentimiento/aprobaciones; probar sin comunicaciones no autorizadas.
6. Conectar la prueba y suscripciones de CEO existentes a conversiones verificables. No inferir ventas de recomendaciones.

Esas activaciones no se ejecutan en la Fase 2.3. n8n y sus workflows existentes continúan opcionales, sin cambios ni eliminación.

## Evidencia y operación

`npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, `npm run test:ui`. Las pruebas PostgreSQL aisladas verifican reutilización de IDs, quinta marca sin segunda organización, duplicados ambiguos, creación explícita segura, permisos, fuentes por proveedor/empresa, manipulación de IDs, compatibilidad del receptor legacy, outbox transaccional, programación/leases/reintentos, conversiones de prueba y RLS.

El catálogo visual se decora con logos/descripciones, pero las listas del dashboard, selector, portafolio y CRM se alimentan de las filas autorizadas reales. Si faltan marcas no se inventan a partir del catálogo. Los errores de consulta muestran un aviso y no se sustituyen por datos simulados.

Después del despliegue, abrir Configuración con la sesión real y revisar el resultado de la vinculación. La máquina sin sesión/credenciales no puede confirmar por sí sola qué filas existían en Production. No declarar las cinco marcas creadas, email conectado o el caso CEO activo basándose únicamente en pruebas locales o un build correcto.
