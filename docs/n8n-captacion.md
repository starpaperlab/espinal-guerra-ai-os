# n8n → CRM · Etapa 2.2.1

## Auditoría y estado verificado

El receptor ya implementado es **POST https://espinal-guerra-ai-os.vercel.app/api/integrations/n8n/leads**. No se creó otro endpoint. Mantiene HMAC SHA-256, ventana de cinco minutos, límite de 32 KiB, validación Zod estricta, organización fijada en el servidor, marca existente por UUID y registro idempotente en `crm_inbound_events`.

La instancia indicada por la administradora es `https://sespinal1-star-automation.9px3rc.easypanel.host`. El workflow es **AI Lead Qualification - Demo 1**: Webhook → Message a model → Code in JavaScript → Switch → Google Sheets → Gmail. Se conoce esta estructura por confirmación de la administradora; no se inspeccionó ni se modificó el workflow. El acceso HTTP desde este entorno fue bloqueado por la red. No hay sesión/API autorizada de n8n ni credenciales Supabase del proyecto real en la máquina.

En Production se observó 503 `Integración CRM no configurada`, antes de los cambios. Esto no prueba un fallo del CRM manual: indica que el receptor automático no tiene toda su configuración. La existencia de un registro de prueba en `crm_leads` fue confirmada por la administradora, no leída directamente desde esta máquina.

## Correcciones y compatibilidad

La versión anterior no admitía campaña, mensaje, presupuesto ni urgencia en el evento. La actualización añade:

| Campo de evento                                                     | Persistencia                                         |
| ------------------------------------------------------------------- | ---------------------------------------------------- |
| `contact.name`, `contact.email`, `contact.phone`, `contact.company` | Campos del contacto                                  |
| `source`                                                            | `crm_leads.source` y `crm_contacts.channel`          |
| `campaign`                                                          | `crm_leads.campaign`                                 |
| `message`                                                           | `crm_contacts.notes` (mensaje original de captación) |
| `budget`                                                            | `crm_leads.budget`, como texto declarado             |
| `urgency`                                                           | `crm_leads.urgency`                                  |
| `service`, `need`                                                   | Interés y necesidad del prospecto                    |
| `score`, `classification`, `evaluated_at`                           | Evaluación recibida, sin algoritmo nuevo             |
| `problem`, `opportunity`, `recommendation`, `next_action`           | Información comercial recibida                       |

Los campos nuevos son opcionales para mantener compatibilidad. No se actualizan retrospectivamente los registros existentes. La migración `202610250003_n8n_capture_fields.sql` solo reemplaza la función receptora y añade una función de versión; no crea tablas, no borra registros ni cambia flags de prueba. No se vuelve a ejecutar la migración 002.

El receptor verifica `crm_inbound_contract_version() = 3` **antes de escribir**. Si falta la actualización o no se puede validar, devuelve 503 con código de diagnóstico `CONTRACT_NOT_READY`, evitando aceptar datos nuevos con una función antigua que omitiría campos.

Los errores incluyen `request_id` y cabecera `X-CRM-Request-Id`. Los logs de Vercel contienen exclusivamente identificador aleatorio, estado HTTP y código acotado (`NOT_CONFIGURED`, `AUTH_INVALID`, `INVALID_PAYLOAD`, `CONTRACT_NOT_READY`, `DB_23505`, etc.). No se registran cuerpos, correos, tokens, firmas o mensajes SQL. Un error de validación indica las rutas de campos, sin sus valores.

## 1. Obtener el JSON real, sin modificar el workflow

1. Abrir la instancia de n8n e iniciar sesión de forma habitual.
2. Abrir **Executions** y una ejecución previa de prueba de **AI Lead Qualification - Demo 1**.
3. Seleccionar **Code in JavaScript**, el nodo posterior a **Message a model** y anterior a **Switch**.
4. Abrir **Output → JSON** y copiar **un solo elemento**. Conservar nombres de claves, estructura anidada, tipos, score y clasificación; anonimizar valores de nombre, correo, teléfono y empresa.
5. Si ese elemento no conserva el contacto o los identificadores de captura, copiar también únicamente el **body** de **Output → JSON** del nodo **Webhook** en esa misma ejecución. No compartir headers, cookies, URLs con tokens, credenciales de Gmail/Sheets ni exportaciones con secretos.

No hace falta volver a ejecutar Gmail, Sheets o todo el workflow para obtener esta información. No se han supuesto nombres como `lead_score` o `output.classification`: el mapa queda deliberadamente sin rutas hasta conocer el JSON verdadero.

## 2. Aplicar la actualización de Supabase

En **el proyecto Supabase existente espinal-guerra-ai-os → SQL Editor**, ejecutar una vez el archivo completo:

`supabase/migrations/202610250003_n8n_capture_fields.sql` (si está pendiente), y después `supabase/migrations/202610250004_n8n_ai_assessment.sql`.

Revisar primero que existe la migración 002 (ya aplicada según la administradora). No repetirla. La actualización 003 es transaccional y compatible con las tablas actuales. Después puede comprobarse como administrador:

```sql
select public.crm_inbound_contract_version(); -- 3
```

La función de versión y la receptora solo son ejecutables por el rol de servidor; los usuarios del navegador no obtienen ese permiso. No se crea otra organización, marca ni proyecto.

## 3. Configuración segura

En **Vercel → proyecto existente espinal-guerra-ai-os → Settings → Environment Variables → Production**, comprobar/configurar los valores reales de:

- `SUPABASE_SERVICE_ROLE_KEY`: clave del proyecto existente; **solo en Vercel**, jamás en n8n, el navegador o Git.
- `CRM_WEBHOOK_SECRET`: secreto robusto de al menos 32 caracteres. Usar el mismo valor en el almacenamiento seguro del firmante n8n; no compartirlo por chat.
- `CRM_WEBHOOK_ORGANIZATION_ID`: UUID de la organización autorizada existente.

Conservar la configuración pública Supabase actual y hacer un nuevo despliegue del proyecto existente tras cambiar variables. No crear otro proyecto Vercel.

La marca se configura con un UUID real de `public.brands` perteneciente a esa organización. La organización nunca se recibe en el payload. No usar nombres como relaciones ni adivinar cuál de las marcas debe recibir una captura del grupo.

## 4. Completar el mapa editable

Archivo: `integrations/n8n/field-map.example.json`.

- En `paths`, sustituir cada `null` por la ruta real del campo en el objeto de entrada; admite rutas con puntos y posiciones de arrays, sin evaluar código ni contenido del modelo.
- Mantener `null` en campos opcionales ausentes. Los campos obligatorios sin mapear impiden preparar el envío.
- En `constants`, fijar `brand_id` al UUID autorizado, o mapearlo si la captura distingue marcas. No usar un UUID inventado.
- Mantener `is_test: true` durante validación. Para captación real futura, cambiarlo explícitamente solo en la rama de datos reales autorizados, nunca para convertir pruebas previas.
- Se necesitan IDs **estables** para `event_id` y `external_id`. No usar nombre/correo como identidad y no generar un UUID/fecha nuevo cada vez que se reintente el HTTP.
- `occurred_at` debe venir de la captura original. `evaluated_at` debe ser la fecha real de la evaluación recibida. El adaptador no inventa fechas ni evaluaciones.
- Si no existe evaluación, score, clasificación y fecha son `null`. Si existe, se requieren los tres. Solo se normaliza representación (`"85"` → `85`, `"hot"` → `"HOT"`), no se deriva una clase del score.

El mapa de ejemplo está incompleto a propósito y falla de forma segura. No representa el JSON actual del workflow. Si faltan IDs/fechas en el flujo real, deben conservarse desde el primer paso de captura antes de activar la entrega; no se promete idempotencia de negocio usando valores regenerados en cada ejecución.

## 5. Incorporar una rama autorizada de entrega, sin duplicar el workflow

Después de verificar el JSON, añadir en **el workflow existente** una rama de entrega al CRM en el punto donde ya se conserva la evaluación y el contacto. Mantener intactos Message a model, Code in JavaScript, Switch, Google Sheets y Gmail. No crear otro workflow ni otra hoja. No apuntar a `/api/lead` del sitio: el destino es el receptor de AI OS indicado arriba.

Se entrega un helper autocontenido: `integrations/n8n/prepare-crm-request.cjs`. No es un workflow exportado ni está instalado en la instancia real. En un nuevo nodo Code llamado, por ejemplo, **Preparar evento CRM**, modo **Run Once for All Items**, pegar sus funciones y después este envoltorio:

```javascript
// fieldMap es el contenido JSON del mapa YA COMPLETADO con las rutas verificadas.
// No pegar el valor del secreto aquí. No copiar datos personales de ejemplos.
const fieldMap = /* objeto del mapa verificado */;
const secret = $env.CRM_WEBHOOK_SECRET;
return $input.all().map(item => ({
  json: prepareMappedCrmRequest(item.json, fieldMap, secret)
}));
```

El comentario del mapa es un punto de sustitución, no código listo para activar sin completar. Si la instalación restringe `$env` o `require('crypto')`, su administrador debe habilitar únicamente el acceso seguro necesario según su configuración de task runners, o usar su mecanismo criptográfico autorizado. No habilitar todos los módulos, desactivar aislamiento ni poner el secreto dentro del código público. Sin conocer esos permisos no se afirma que el helper esté ejecutándose en n8n.

La salida contiene `body` (cadena JSON exacta) y `headers`. Conectar un **HTTP Request** en esa rama:

- Método: **POST**.
- URL: **https://espinal-guerra-ai-os.vercel.app/api/integrations/n8n/leads**.
- Headers: usar el objeto de expresión `{{ $json.headers }}` en el modo JSON de cabeceras, o asignar sus tres valores individualmente.
- Body: **Raw**, tipo `application/json`, expresión **`{{ $json.body }}`**. No usar un modo que vuelva a serializar la cadena firmada.
- No añadir `service_role`, claves Supabase ni una autorización alternativa. La firma HMAC es la autenticación del receptor.

La firma es `sha256=<hex HMAC-SHA256(secret, timestamp + '.' + body)>`; el timestamp es Unix en segundos. En un reintento conservar evento/cuerpo/IDs y regenerar solo timestamp/firma. Un HTTP retry inmediato puede reutilizar firma dentro de cinco minutos; los reintentos diferidos deben volver a firmar sin volver a ejecutar los nodos de correo/Sheets.

Tratamiento: 200 recibido (incluido duplicado); 400 corregir campos; 401 corregir secreto/firma/hora; 409 revisar reutilización de ID con contenido distinto; 413 reducir tamaño; 415 corregir Content-Type; 422 revisar marca; 503 revisar configuración/migración o reintentar de forma limitada si es transitorio. No reintentar todo el workflow para repetir una entrega al CRM.

## 6. Validar la conexión real, todavía pendiente

Con acceso autorizado y el mapa revisado, enviar un evento identificado `is_test=true` desde la nueva rama de entrega, sin repetir los nodos Gmail/Sheets. Comprobar respuesta 200 y conservar su `lead_id` y `X-CRM-Request-Id` (no firmas/secretos).

En Supabase, comprobar el lead por ese ID y su contacto relacionado: campos completos, clasificación original e `is_test=true`; revisar su recibo en `crm_inbound_events`. Reenviar el mismo evento y confirmar mismo lead, `duplicate=true`, sin otra fila. Comparar los indicadores reales antes/después: deben permanecer iguales. No borrar registros anteriores ni importar las pruebas de Sheets como reales.

Para el registro de prueba que ya existe, revisar su procedencia con una consulta de solo lectura usando su UUID real:

```sql
select l.id,l.is_test,c.is_test as contact_is_test,l.score,l.classification
from public.crm_leads l join public.crm_contacts c on c.id=l.contact_id
where l.id = '<UUID real del registro de prueba>'::uuid;
```

Si no está marcado como prueba, detener el envío y revisar el caso sin borrar filas ni desactivar triggers. Esta ejecución no ha inspeccionado ese registro real ni lo ha cambiado.

## Evidencia de pruebas incluidas

Las pruebas locales usan el adaptador real → receptor real → función SQL en PostgreSQL aislado (PGlite). Verifican campos completos, HOT/WARM/COLD, validación/firma, protección entre organizaciones/marcas, reintentos, identidad externa estable, preservación de filas al migrar, exclusión de pruebas, permisos del servidor y logs sin información sensible. No conectan n8n ni escriben en Supabase Production. La interfaz, autenticación y CRM manual permanecen sin cambios en esta etapa.

## Actualización: estructura de Message a model confirmada

La estructura del modelo fue suministrada después de esta auditoría inicial. Ya existe un lector y un mapa parcial para sus nueve campos, pero el OUTPUT de Code in JavaScript sigue sin verificarse. Consultar [respuesta del modelo y recomendaciones no confirmadas](n8n-model-output.md). El contrato actual es 3 y requiere la migración 004; las sugerencias no activan comunicaciones, tareas o compromisos.
