# Respuesta observada de Message a model · mapeo pendiente del Code

## Confirmado y pendiente

La administradora compartió la forma real de una ejecución anterior de **Message a model**: array con un objeto `output`, mensajes con `content`, un elemento `type="output_text"` y su `text` como cadena JSON. Sus campos confirmados son `lead_score`, `classification`, `priority`, `route_to_sales`, `main_problem`, `commercial_opportunity`, `recommended_action`, `response_suggestion` y `scoring_breakdown`.

Esto **no es el payload final del workflow**. No se inspeccionó la salida ni el código de **Code in JavaScript**. Puede que ya haga el parseo y combine el contacto. No se ha modificado ningún nodo, conexión, workflow, Sheets o Gmail; no se ha comprobado un envío efectivo en Supabase Production.

## Lector de la respuesta conocida

`integrations/n8n/model-assessment.cjs` exporta `extractModelAssessment(response)`. Acepta el objeto observado o un array de **un solo elemento**. Busca exactamente un `output_text` y aplica `JSON.parse`, sin `eval`, sin ejecutar instrucciones, sin corregir markdown y sin escoger arbitrariamente entre múltiples mensajes/prospectos.

Valida score 0–100, HOT/WARM/COLD, tipos y límites. No recalcula el score ni su desglose. Extrae solo los campos de evaluación confirmados; aunque el modelo añada nombres, correos, presupuestos o fechas, no los toma como datos del contacto.

## Mapa preparado, todavía no activable

`integrations/n8n/field-map.model-response.example.json` contiene estas correspondencias conocidas sobre un objeto de preparación explícito `{ assessment, capture }`:

| Campo del CRM         | Respuesta de modelo                 |
| --------------------- | ----------------------------------- |
| `score`               | `assessment.lead_score`             |
| `classification`      | `assessment.classification`         |
| `priority`            | `assessment.priority`               |
| `route_to_sales`      | `assessment.route_to_sales`         |
| `problem`             | `assessment.main_problem`           |
| `opportunity`         | `assessment.commercial_opportunity` |
| `recommendation`      | `assessment.recommended_action`     |
| `response_suggestion` | `assessment.response_suggestion`    |
| `scoring_breakdown`   | `assessment.scoring_breakdown`      |

`assessment` y `capture` son nombres **del objeto de preparación nuevo**, no propiedades supuestas del workflow existente. En una revisión aislada se puede construir `assessment` con el lector anterior. Si Code ya devuelve un objeto normalizado, usar sus rutas verificadas con `prepareMappedCrmRequest` y no añadir un segundo parseo.

Las rutas de contacto, empresa, fuente, campaña, mensaje, servicio, presupuesto y urgencia permanecen en `null` hasta revisar el Webhook/Code real. Tampoco se generan IDs, marca, fecha de captura o fecha de evaluación. La evaluación del modelo no contiene fechas: deben provenir de la ejecución real verificada, no fabricarse con la hora de un reintento.

`budget_strength` es un componente del scoring, **no un presupuesto declarado**. El componente `scoring_breakdown.urgency` tampoco es una fecha o urgencia expresada por el prospecto. No se mapean a esos datos de captura. `is_test` continúa fijado a `true` en el ejemplo. El mapa incompleto falla antes de firmar, en lugar de enviar un contacto inventado.

## Recomendaciones y compromisos

- `recommended_action` se guarda como recomendación recibida (`ai_recommendation`), no como tarea operativa confirmada.
- `priority`, `route_to_sales`, `response_suggestion` y el desglose se guardan en `crm_leads.ai_metadata`, con `content_kind="ai_recommendation"`.
- `route_to_sales=true` es una señal del modelo: no asigna responsable, no mueve el pipeline y no crea una oportunidad.
- `response_suggestion` puede contener precios, llamadas o reuniones no autorizados. No se envía a prospectos ni se transforma en propuesta, presupuesto, fecha o compromiso.
- `next_action` solo se completa si existe una acción humana u operativamente autorizada en una fuente verificada. El ejemplo no lo toma del modelo.
- No se añadieron automatizaciones de comunicaciones ni se alteró la configuración de Gmail existente. Su contenido real no fue auditado en esta ejecución; no se afirma que esa plantilla use o no estas sugerencias.

## Actualización SQL necesaria

En el proyecto Supabase existente, aplicar las actualizaciones pendientes en orden:

1. `202610250003_n8n_capture_fields.sql`, únicamente si aún no está aplicada.
2. `202610250004_n8n_ai_assessment.sql`.

No repetir la fundación ni la migración 002. La 004 agrega una columna JSONB para conservar los metadatos, reemplaza la misma función receptora y avanza el contrato a **3**. Conserva registros anteriores, estados, flags de prueba e idempotencia. No importa datos ni envía mensajes. El receptor verifica el contrato 3 antes de escribir, evitando perder los nuevos campos si falta esta actualización.

## Información exacta que falta

**Sí, se necesita el OUTPUT de Code in JavaScript para cerrar el mapeo definitivo.**

Abrir **Executions → una ejecución anterior de prueba de AI Lead Qualification - Demo 1 → Code in JavaScript → Output → JSON**. Copiar un elemento completo, conservando claves, estructura y tipos; anonimizar datos personales. No copiar credenciales, cookies o headers.

Si ese resultado no contiene datos del contacto/identificadores/fechas, copiar además **solo el body de Output → JSON del Webhook inicial de la misma ejecución**. No volver a ejecutar todo el workflow ni repetir Gmail/Sheets para obtenerlo.

Con esos resultados se podrá determinar si Code ya parsea el JSON, cómo preserva el contacto, dónde están IDs/fechas estables y qué cambios de mapeo son necesarios. Hasta verificarlos no se activa la rama de entrega ni se declara completa la integración. Se mantiene el receptor real: `POST /api/integrations/n8n/leads`.

## Pruebas

Se probaron el sobre observado, parseo estricto, rechazo de múltiples elementos y tipos inválidos, preservación de los nueve campos, exclusión de datos de contacto inventados por el modelo y fallo seguro del mapa incompleto. En PostgreSQL aislado se verificaron la migración sobre registros anteriores y la persistencia de metadatos como sugerencias sin crear tareas, cambiar etapas o rellenar presupuestos. Estas pruebas no equivalen a recibir un evento desde la instancia n8n real.
