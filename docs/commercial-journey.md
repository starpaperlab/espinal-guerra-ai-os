# Integración comercial CEO Rentable

Se conserva Marketing API y Pixel existentes sin cambios de activos/tokens. La usuaria confirmó vinculación de Meta Ads, sincronización sin campañas y actividad del píxel. Esta fase agrega recepción de hechos comerciales propios, no otra CAPI ni anuncios.

## Receptor y destino

Se reutiliza `POST /api/integrations/capture/[sourceKey]`. CEO envía la fuente autorizada `ceo-rentable-diagnostico`, con HMAC existente (X-CRM-Timestamp, X-CRM-Signature y JSON exacto), nunca credenciales en navegador. El receptor continúa admitiendo las capturas anteriores y n8n opcional. Si hay `journey`, llama exclusivamente a `crm_ingest_commercial_source`; si falta la migración nueva, falla y el emisor conserva el trabajo para reintentar. No se acepta silenciosamente perdiendo hechos.

La fuente habilitada y la vinculación empresarial existentes determinan organización y marca en servidor. El contrato comercial rechaza un Brand ID enviado en ese evento, incluso si parece correcto. No se crean marcas/organizaciones ni se usa la cuenta publicitaria como identidad del contacto.

El lead externo usa la captura UUID prefijada por fuente; el contacto se reutiliza por email normalizado únicamente dentro de su empresa/marca/procedencia de prueba. La idempotencia verifica hash y event_id. No se cambia el indicador is_test existente ni se fusionan contactos de prueba con reales. Cambiar contenido bajo el mismo ID se rechaza.

## Hechos e informes

`crm_commercial_events` usa RLS de organización, FK compuesta organización/marca/lead y solo escritura de servidor. Registra diagnóstico, registro verificado, prueba, cancelación, pago y aceptación de correo; las visitas/checkout observadas por navegador están identificadas como tal. Una visita no crea un ingreso. Diagnóstico conserva resultado, respuestas, formulario y UTMs en capture_metadata.

El CEO Score se guarda como diagnóstico, **no** como lead_score o HOT/WARM/COLD. Un indicador de control financiero no acredita intención comercial. Trial y pago verificados crean conversiones en la tabla ya existente; solo pago positivo con ID/proveedor/moneda puede crear importe. La clave de conversión de pago usa proveedor e ID para no sumar la misma captura dos veces.

`crm_commercial_report` es SECURITY INVOKER, valida membresía y respeta RLS; aparece en Ventas y Marketing. Excluye pruebas, separa monedas y distingue aceptación por Resend de entrega real. La prueba activa se calcula a partir de su fin confirmado y de los eventos recibidos de pago/cancelación; el informe no consulta al proveedor en vivo. Las agrupaciones de campaña muestran UTM declarada o ausencia de evidencia; no afirman atribución de Meta ni reconstruyen conversiones históricas.

## Configuración manual necesaria

Las migraciones finales son reaplicables y sus pruebas verifican que conservan datos. Si se ejecutó una copia intermedia, reaplicar los archivos finales del commit de entrega.

1. Aplicar `supabase/migrations/202610260008_commercial_journey.sql` en el Supabase AI OS existente, después de 005/006. Conservar 007 de Meta. No necesita otro proyecto.
2. En Configuración, comprobar/habilitar la fuente CEO existente, proveedor signed_backend y UUID real de la marca. Si falta bootstrap 006, usar primero la auditoría empresarial existente; no crear otra empresa para solucionar una fuente ausente.
3. En Vercel AI OS Production: SUPABASE_SERVICE_ROLE_KEY del proyecto y CRM_WEBHOOK_SECRET privado de 32+ caracteres. Se conservan las variables de autenticación y META_ACCESS_TOKEN existentes. No hay Brand ID fijo que configurar.
4. En CEO aplicar su migración comercial, usar el mismo secreto exclusivamente del lado del servidor y activar las banderas solo después de la prueba. Ver [guía de CEO](https://github.com/starpaperlab/ceo-rentable-vsc/blob/main/docs/COMMERCIAL_JOURNEY.md) para los pasos exactos, Resend, cron y sandbox.
5. Cambios en variables requieren redeploy; habilitar una fuente o aplicar SQL no cambia builds. No compartir valores privados.

## Validación reproducible

`npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:ui`.

`npm run test:commercial-pair` requiere también el repositorio CEO con sus dependencias en `../ceo-rentable-vsc`, o indicar `CEO_REPO_PATH`. Ejecuta dos PostgreSQL locales y el emisor/receptor reales con HMAC, usando fixtures solo para Meta/PayPal/Resend. Comprueba contacto/marca, diagnóstico, UTMs, correo aceptado, prueba, pago y métricas. No escribe Supabase real ni envía emails/cargos. Las pruebas de cada repositorio también se ejecutan de forma independiente en CI.

Pendiente de operación real: migraciones/configuración, captura de prueba recibida en CRM, correo en bandeja, activación/cobro sandbox y Meta Events Manager. Las secuencias 0/2/4/7/9 están preparadas en CEO pero no tienen envío promocional activo. No se declara listo el primer anuncio hasta confirmar ese recorrido con las instalaciones existentes.
