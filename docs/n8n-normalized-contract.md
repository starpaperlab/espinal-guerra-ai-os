# Contrato final normalizado de Code in JavaScript → CRM

## Formato confirmado

La administradora confirmó que **Code in JavaScript**, antes de Switch, entrega un array de objetos planos con `name`, `email`, `phone`, `company`, `source`, `service_interest`, `message`, `monthly_leads`, `budget`, `urgency`, `lead_score`, `classification`, `priority`, `route_to_sales`, `main_problem`, `commercial_opportunity`, `recommended_action`, `response_suggestion` y `scoring_breakdown`.

Este adaptador utiliza directamente ese formato; **no vuelve a parsear Message a model**. La confirmación de la estructura procede de la administradora. No se ha inspeccionado ni modificado el workflow real, ni se afirma que ya entregue eventos al CRM.

## Mapeo aplicado

| Salida normalizada                                                       | Destino                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `name`, `email`, `phone`, `company`                                      | `crm_contacts`                                                                 |
| `source`                                                                 | Canal del contacto y fuente del prospecto                                      |
| `service_interest`                                                       | `crm_leads.service`; `null` queda vacío                                        |
| `message`                                                                | Observación original del contacto                                              |
| `monthly_leads`                                                          | `crm_leads.capture_metadata.monthly_leads`, preservando número, texto o `null` |
| `budget`, `urgency`                                                      | Texto declarado en el prospecto; no se extrae de las recomendaciones           |
| `lead_score`, `classification`                                           | Evaluación recibida, sin recalcular                                            |
| `priority`, `route_to_sales`, `scoring_breakdown`, `response_suggestion` | `ai_metadata`, como recomendaciones no confirmadas                             |
| `main_problem`, `commercial_opportunity`, `recommended_action`           | Problema, oportunidad y recomendación de IA recibidos                          |

Los opcionales `null` no generan datos ficticios. Un nombre ausente o inválido bloquea el envío; no se toma de `response_suggestion`. Los precios, reuniones y horarios sugeridos nunca rellenan presupuesto, fecha o próxima acción confirmada. `route_to_sales=true` no mueve el pipeline ni envía comunicaciones.

El contexto de transporte fija `brand_id` al UUID existente autorizado; `organization_id` permanece exclusivamente en Vercel. La marca es validada por la función SQL contra esa organización.

## Identidad y fechas: límites explícitos

El formato confirmado no contiene IDs de captura ni fechas. Para que cada nueva captura pueda enviarse sin intervención por registro:

- El adaptador usa `$workflow.id`, `$execution.id` y posición del elemento para un ID de evento reproducible. No usa correo, nombre o un UUID aleatorio regenerado al reintentar.
- Dentro de la **misma ejecución**, repetir el HTTP con el mismo cuerpo devuelve el mismo prospecto.
- Si la captura original tiene un ID estable, puede pasarse como `source_event_id` al helper `normalizeN8nLead`. Así se evita duplicar el prospecto incluso si se procesa de nuevo en otra ejecución.
- **Sin ese ID de origen no se promete deduplicación entre ejecuciones distintas** que reciban de nuevo el mismo formulario. No se fusionan personas por correo para intentar resolverlo.
- `$now.toISO()` se toma una sola vez al preparar el evento como instante real de observación en ese nodo. Se registra `n8n_observed` en `capture_metadata.event_context`: no se presenta como la hora exacta del formulario o del modelo.
- Si se dispone de fechas originales verificadas, el helper admite `captured_at` y `evaluated_at` y deja su procedencia como `source`.

Reintentar únicamente el HTTP conserva el cuerpo y sus fechas. No regenerar la preparación ni volver a ejecutar IA/Gmail/Sheets para reintentar una entrega. Las firmas caducan en cinco minutos; los reintentos inmediatos limitados deben estar dentro de esa ventana. Para reintentos posteriores, recuperar el evento preparado y volver a firmar **el mismo cuerpo** con el helper, sin recrear la captura ni cambiar su ID.

## Paso manual 1 · Actualización Supabase

En **Supabase → proyecto existente espinal-guerra-ai-os → SQL Editor**, ejecutar una vez:

`supabase/migrations/202610250005_n8n_normalized_capture.sql`

Esta actualización puede aplicarse directamente sobre la fundación CRM **002**, ya confirmada, aunque 003/004 estén pendientes. Incluye la función receptora completa y añade `ai_metadata`/`capture_metadata` si faltan. También es compatible si 003/004 ya fueron aplicadas. No volver a ejecutar scripts anteriores después de 005, porque podrían retroceder la versión de la función.

No crea tablas comerciales, organizaciones, marcas ni usuarios; no borra ni reclasifica registros existentes. Se probó tanto la actualización secuencial como el salto directo desde 002. Comprobación administrativa posterior:

```sql
select public.crm_inbound_contract_version(); -- 4
```

El receptor exige contrato **4** antes de escribir. Si falta la actualización, responde 503 y no acepta datos que perderían campos. El resto del CRM continúa usando sus tablas y autenticación habituales.

## Paso manual 2 · Variables seguras, sin valores en código

**Vercel → proyecto espinal-guerra-ai-os → Settings → Environment Variables → Production**: verificar/configurar:

- `SUPABASE_SERVICE_ROLE_KEY`: clave real del mismo proyecto. Solo Vercel, nunca n8n ni navegador.
- `CRM_WEBHOOK_SECRET`: secreto robusto de al menos 32 caracteres.
- `CRM_WEBHOOK_ORGANIZATION_ID`: UUID de la organización existente autorizada.

Conservar las variables Supabase públicas existentes. Desplegar de nuevo el mismo proyecto después de cambiar valores.

**EasyPanel → servicio n8n existente → Environment** (y su runner si usa uno separado): configurar por el mecanismo autorizado:

- `CRM_WEBHOOK_SECRET`: mismo secreto HMAC que Vercel.
- `CRM_BRAND_ID`: UUID existente de la marca destino, perteneciente a la organización fijada.
- `CRM_CAPTURE_IS_TEST`: **`true`** durante validación.

La instalación debe permitir al Code node leer esas variables y usar únicamente el módulo builtin `crypto`. Si su política lo bloquea, resolverlo con su administrador; no pegar el secreto en el código, no habilitar todos los módulos ni desactivar el aislamiento. No se han modificado estas variables ni permisos de la instancia real desde esta ejecución.

## Paso manual 3 · Rama paralela dentro del workflow existente

En **AI Lead Qualification - Demo 1**, mantener intacto:

`Code in JavaScript → Switch → Google Sheets → Gmail`

Añadir únicamente una **rama paralela** desde el mismo Code existente:

`Code in JavaScript → Preparar evento CRM → HTTP Request CRM`

No insertar el nuevo preparador en serie con Switch: su salida son `body` y `headers`, no el formato que consumen los nodos anteriores. No crear otro workflow ni otra hoja.

### Preparar evento CRM

Nuevo nodo **Code**, modo **Run Once for All Items**. Copiar íntegro:

`integrations/n8n/prepare-normalized-code-node.js.txt`

Es un artefacto autocontenido generado mediante `npm run build:n8n`, probado como código de n8n. No depende de instalar el repositorio en el servidor ni contiene secretos. Utiliza las variables y metadatos anteriores, incluido el array recibido de Code.

El modo de pruebas es explícito. Además, las ejecuciones de prueba o de modo desconocido conservan `is_test=true` aunque el modo configurado para captación real sea `false`. Si una entrada ya viene marcada como prueba, tampoco se convierte en real. No se infieren pruebas por nombre o correo.

En **Settings → On Error**, utilizar **Continue (using error output)** si está disponible en la versión instalada. Conectar solamente la salida de éxito al HTTP; la salida de error debe quedar separada y revisarse en Executions. Esto evita que un fallo de preparación detenga las ramas originales. No conectar errores a Gmail/Sheets ni considerar un error como captación completada.

### HTTP Request CRM

- **Method:** POST.
- **URL:** `https://espinal-guerra-ai-os.vercel.app/api/integrations/n8n/leads` (receptor existente).
- **Headers:** JSON con expresión `{{ $json.headers }}`; alternativamente asignar sus tres campos.
- **Body:** Raw, Content-Type `application/json`, expresión `{{ $json.body }}`.
- No volver a serializar el cuerpo firmado. No añadir claves Supabase ni una autorización alternativa.
- **On Error:** Continue (using error output), manteniendo la salida de error separada. Revisar HTTP 4xx/5xx y `request_id`; no contarlos como éxito ni repetir todo el workflow.
- Si se configuran reintentos, limitarlos al nodo HTTP y a la ventana de cinco minutos con el mismo cuerpo. No hacer reintentos indefinidos de 400/401/409/422.

Los nombres de controles pueden variar por versión; no se ha verificado la UI real de la instancia. Los valores de transporte y las expresiones anteriores son el contrato exacto que necesita el receptor.

## Paso manual 4 · Validación real todavía pendiente

Con `CRM_CAPTURE_IS_TEST=true`, ejecutar solo la rama nueva con un elemento de prueba, sin repetir correos ni escrituras auxiliares. Requerir respuesta 200 y conservar `lead_id`/`request_id`. Comprobar en Supabase:

- Un contacto y un prospecto con organización y marca correctas.
- Contacto, servicio nullable, mensaje, presupuesto, urgencia y volumen conservados.
- Evaluación, desglose y recomendaciones recibidos, sin tareas ni compromisos nuevos.
- `is_test=true` en contacto y lead; indicadores reales sin cambios.
- Repetición del HTTP: mismo lead y sin otra fila. `crm_inbound_events` registra el recibo.

Solo después de validar toda la cadena y seleccionar una captación realmente comercial, cambiar `CRM_CAPTURE_IS_TEST=false` para ejecuciones de producción nuevas. No reprocesar datos históricos de prueba como reales. El modo manual/desconocido sigue siendo de pruebas.

Hasta comprobar esa escritura desde n8n en Supabase no se declara completada la integración. Las pruebas automatizadas usan PostgreSQL aislado y no equivalen a una entrega real de la instancia.
