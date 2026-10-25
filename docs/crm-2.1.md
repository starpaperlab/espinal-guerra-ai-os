# CRM · Etapa 2.1

## Auditoría y alcance

Se revisaron `main`, autenticación por `requireWorkspace`, cliente Supabase SSR, la migración de fundación, las políticas RLS versionadas, los módulos y los contratos de `src/integrations/contracts.ts`. Estos últimos no contienen conexiones reales, URL de n8n ni contratos del workflow externo. Las mejoras de identidad ya estaban integradas en main y se conservan.

No se pudo inspeccionar el esquema vivo ni ejecutar operaciones en el proyecto Supabase existente desde esta máquina: no hay variables Supabase o credenciales SQL inyectadas ni conector administrativo disponible. La administradora eligió aplicar la migración manualmente desde Supabase. Las pruebas de PostgreSQL se ejecutan exclusivamente en PGlite aislado, nunca contra Production. No se importó Google Sheets ni se modificó espinalguerra.com, `/api/lead`, n8n o sus correos.

## Aplicación manual en el proyecto existente

1. Abrir **Supabase → proyecto espinal-guerra-ai-os → SQL Editor**. Confirmar que es el proyecto existente, sin crear otro.
2. Revisar primero el esquema real y las políticas, sin cambiar datos:

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public' and table_name in ('organizations','organization_members','brands')
order by table_name,ordinal_position;
select tablename,policyname,roles,cmd,qual,with_check
from pg_policies where schemaname='public';
select id,organization_id,slug,name from public.brands order by organization_id,name;
```

La fundación esperada es la de `supabase/migrations/202610250001_foundation.sql`: UUID de organización, membresías por usuario y marcas con UUID, `organization_id`, `slug` y `name`. Verificar las cuatro marcas existentes. No ejecutar de nuevo la fundación, no duplicar marcas y no crear organizaciones. Si el esquema no coincide o ya existen tablas `crm_*`, detener la aplicación y revisar la diferencia; no borrar tablas para hacer pasar el script.

3. Ejecutar **una sola vez y completo** `supabase/migrations/202610250002_crm.sql`. Es una transacción aditiva: ante un error no aplicar fragmentos por separado ni eliminar políticas existentes. No contiene semillas ni carga prospectos de prueba.
4. Verificar:

```sql
select c.relname,c.relrowsecurity from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
('crm_contacts','crm_leads','crm_opportunities','crm_activities','crm_proposals','crm_history','crm_inbound_events');
select id,organization_id,slug,name from public.brands order by organization_id,name;
```

Las siete tablas deben tener RLS. Las marcas y membresías anteriores deben conservarse. Con un usuario autorizado, un CRM vacío devolverá métricas reales de cero. Si falta la migración o falla la consulta, la UI muestra un error, no una simulación.

## Modelo y seguridad

- `crm_contacts`: contacto, empresa, canales, etiquetas, observaciones y estado.
- `crm_leads`: marca, fuente, campaña, interés, necesidad, presupuesto, urgencia, evaluación recibida, responsable, próxima acción y fecha.
- `crm_opportunities`: pipeline, producto/servicio, importe estimado, moneda, probabilidad, cierre previsto, valor cerrado y resultado generado desde la etapa.
- `crm_activities`: llamada, correo, WhatsApp, mensaje, reunión, tarea, seguimiento o nota; vencimiento y completado. Registrar un correo/WhatsApp **no lo envía**.
- `crm_proposals`: registro de propuesta, productos/servicios, importe, moneda, estado y vigencia; no genera PDF ni envía mensajes.
- `crm_history`: historial automático de altas y actualizaciones, con autor y valores anteriores/posteriores. El cliente solo puede leerlo.
- `crm_inbound_events`: recibos idempotentes del webhook; inaccesible para usuarios y anónimos.

Las claves foráneas compuestas incorporan `organization_id` y `brand_id`. No se pueden relacionar registros de otra marca ni cambiar su organización, marca o procedencia de prueba mediante UPDATE. Los usuarios solo acceden a sus organizaciones según las membresías existentes. En la organización autorizada pueden trabajar con cualquiera de sus marcas; no se han inventado permisos de marca adicionales que no existían antes. Cada acción del servidor vuelve a comprobar sesión y membresía y filtra por organización.

`crm_create_lead` crea contacto y prospecto en una transacción. `request_id` evita duplicados de doble envío. Las oportunidades, actividades y propuestas también tienen identificadores idempotentes. No se fusionan personas por correo o teléfono. Las tarjetas del pipeline actualizan una oportunidad existente con control de versión; nunca insertan otra al moverla. Ganar exige valor cerrado; perder o reabrir elimina el valor cerrado de ese registro.

Los indicadores se calculan por SQL/RLS con todas las filas autorizadas, no por contar la página visible. Se excluye `is_test=true`; la marca de prueba se propaga desde el contacto al resto de registros y no se puede convertir en real con UPDATE. El valor ganado se agrupa por moneda, sin sumar DOP con USD/EUR. Los seguimientos pendientes incluyen fechas de prospectos abiertos y actividades sin completar con fecha. Las propuestas enviadas son las registradas en `crm_proposals` como `sent`, no una estimación basada en la etapa del pipeline.

La bandeja pagina 20 registros. Pipeline y seguimientos muestran hasta 200 por selección, con el total explícito y filtro de marca. La ficha muestra hasta 100 actividades, oportunidades, propuestas e historial reciente; el historial indica su total. No depende de Sheets. La evaluación HOT/WARM/COLD y el score se muestran tal como se reciben; no hay otro algoritmo de scoring.

## Operación del CRM

1. Iniciar sesión con la cuenta existente y abrir **Ventas y CRM**.
2. Seleccionar una marca de Supabase o todas. Una marca no autorizada en la URL se rechaza.
3. Registrar prospecto con marca y nombre obligatorios; se admiten contacto, necesidad, presupuesto, etiquetas, observaciones y seguimiento. Los horarios del formulario son de República Dominicana, guardados como UTC.
4. Abrir la ficha para editar, asignar la cuenta actual como responsable, programar seguimiento, registrar actividad o propuesta y crear una oportunidad.
5. En Pipeline o la ficha, elegir la etapa y **Guardar etapa**. Para Ganado, indicar el valor cerrado. Si otra sesión cambió el registro, recargar antes de guardar.
6. En Seguimientos, revisar fechas vencidas/próximas y marcar actividades completadas. Las fechas de seguimiento del prospecto se actualizan o limpian desde su ficha.
7. Recargar y volver a entrar: los datos se leen de Supabase, no de almacenamiento del navegador. No se almacenan contactos en localStorage.

## Receptor nuevo para n8n (preparado, no conectado)

**POST `/api/integrations/n8n/leads`** es un endpoint nuevo de AI OS, no reemplaza `/api/lead` del sitio web. No se ha cambiado el workflow **AI Lead Qualification - Demo 1** ni la hoja **AI Sales Lab - Leads**. Para conectarlo se necesita autorización y acceso al workflow actual.

En el **proyecto Vercel existente**, configurar de forma segura, exclusivamente para el servidor:

- `SUPABASE_SERVICE_ROLE_KEY`: clave real del mismo proyecto Supabase. Nunca `NEXT_PUBLIC_` ni dentro de n8n o del navegador.
- `CRM_WEBHOOK_SECRET`: secreto aleatorio robusto de al menos 32 caracteres compartido con el firmante n8n; no reutilizar contraseñas. No se proporciona ningún secreto ficticio.
- `CRM_WEBHOOK_ORGANIZATION_ID`: UUID de la organización existente autorizada.

Mantener las dos variables públicas Supabase existentes. Reconstruir el despliegue tras configurar variables. El endpoint devuelve 503 hasta estar configurado. Una clave `service_role` solo se usa en este Route Handler; la organización está fijada en el servidor, no en el payload.

Contrato JSON (los comentarios siguientes son explicación, no parte del JSON):

| Campo                                                     | Regla                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `type`                                                    | `lead.created`                                                                               |
| `event_id`                                                | Identificador estable del evento, 1–160 caracteres; conservarlo en cada reintento            |
| `external_id`                                             | ID estable del prospecto en origen, no nombre/correo como clave de fusión                    |
| `brand_id`                                                | UUID existente de una marca de la organización fijada                                        |
| `contact`                                                 | Objeto con `name` obligatorio y `company`, `email`, `phone` opcionales                       |
| `source`                                                  | Fuente real de captación, obligatoria                                                        |
| `service`, `need`                                         | Interés y necesidad recibidos, opcionales                                                    |
| `score`                                                   | Entero 0–100 o `null`                                                                        |
| `classification`                                          | `HOT`, `WARM`, `COLD` o `null`                                                               |
| `evaluated_at`                                            | Fecha ISO con zona o `null`; puntuación, clase y fecha se reciben juntos o todos como `null` |
| `problem`, `opportunity`, `recommendation`, `next_action` | Información recibida del clasificador, opcional                                              |
| `occurred_at`                                             | Fecha ISO con zona del evento original                                                       |
| `is_test`                                                 | Booleano explícito; nunca importar los leads anteriores de prueba como reales                |

No se aceptan campos desconocidos ni `organization_id` en el payload. Máximo 32 KiB. La fuente del grupo debe mapear explícitamente una marca real según su captación; no asumir una marca por defecto ni usar nombres como relaciones.

Firma:

```text
rawBody = JSON.stringify(evento)
timestamp = epoch Unix actual en segundos (10 dígitos)
signature = hex(HMAC_SHA256(CRM_WEBHOOK_SECRET, timestamp + "." + rawBody))
```

Enviar exactamente `rawBody` como cuerpo, sin reserializar después de firmar, con:

```text
Content-Type: application/json
X-CRM-Timestamp: <timestamp>
X-CRM-Signature: sha256=<signature>
```

La firma tiene una ventana de cinco minutos. En reintentos conservar el cuerpo y los IDs, pero generar timestamp/firma actuales. Repetir el evento con contenido diferente devuelve 409. La misma identidad de origen dentro de la marca tampoco crea un segundo prospecto aunque llegue otro evento. La recepción de `lead.created` no sobrescribe evaluaciones de un prospecto ya registrado; actualizaciones externas posteriores requieren un contrato específico futuro.

Para conectar sin reconstruir el flujo existente:

1. Revisar su salida real de calificación y mapearla al contrato anterior; no se conocen aquí los nombres internos de esos campos.
2. Conservar el workflow y sus salidas actuales. Añadir una rama autorizada para enviar este evento a la URL Production de AI OS. No retirar Sheets ni los correos existentes.
3. Configurar el secreto solo en el almacenamiento seguro del firmante. Generar la firma con HMAC SHA-256 (nodo criptográfico o código habilitado en la instalación existente); el cuerpo enviado debe ser la misma cadena firmada. Nunca enviar `service_role` desde n8n.
4. Usar IDs estables y la marca UUID verificada; manejar 200 como recibido, 409 como conflicto a revisar, 400/401/422 como errores que no se deben reintentar sin corrección y 503 como error temporal con reintento limitado.
5. Validar primero fuera de Production con registros `is_test=true`. Las pruebas incluidas ya ejercitan el receptor contra PostgreSQL aislado. No ejecutar cargas ficticias en producción ni importar retrospectivamente la hoja de pruebas.

Respuesta 200: `{ "lead_id": "…", "duplicate": true|false }`. `duplicate` señala un reintento del mismo evento. No hay correos, WhatsApp, seguimientos automáticos ni nuevas llamadas a IA en esta etapa.

## Verificación y límites comprobados

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
```

`npm test` ejecuta las pruebas HTTP y PostgreSQL aislado (PGlite): RLS para anónimo/sin membresía/autorizado, aislamiento de organizaciones y marcas, creación/edición/lecturas persistidas, pipeline, actividades, propuestas, historial, flags de prueba y monedas, validaciones y webhook firmado con reintentos y límites. Los datos de esos tests solo existen en la base local efímera.

`test:ui` usa fixtures exclusivamente en tests para revisar los ocho módulos y seis vistas CRM (vacío, bandeja, ficha, pipeline, seguimiento y migración pendiente) en seis anchos. No son una fuente de datos de la aplicación.

No equivale a haber probado el login, PostgREST, las migraciones o el CRUD contra Supabase Production. Después de aplicar la migración y de que Vercel esté Ready, la administradora debe comprobar con su sesión real: marca seleccionada, alta/edición de un registro real autorizado, recarga, oportunidad y etapas, actividad/completado, historial, cierre y reapertura de sesión. Si no existen registros reales para operar, no crear ventas o prospectos ficticios para simular ese resultado.
