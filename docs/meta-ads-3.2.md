# Fase 3.2 · Meta Ads de solo lectura

## Estado y puesta en marcha

La usuaria reportó que `META_ACCESS_TOKEN` ya está en Vercel Production. Esta máquina no tiene ese token, credenciales SQL ni una sesión privada de la aplicación. El despliegue del código no permite afirmar que el token sirve, qué permisos tiene o si existen campañas. La comprobación real se realiza desde la sesión autorizada en Marketing; el resultado se guarda en Supabase.

1. En **Supabase → proyecto existente espinal-guerra-ai-os → SQL Editor**, ejecutar completo `supabase/migrations/202610250007_meta_ads_readonly.sql` una sola vez. Requiere foundation/CRM existentes (001/002); es compatible con 005/006 y no depende del bootstrap 006. No crea ni modifica organizaciones, marcas o registros CRM.
2. Entrar con la cuenta owner/admin habitual en **https://espinal-guerra-ai-os.vercel.app/marketing**.
3. Pulsar **Vincular cuenta CEO Rentable OS**. El servidor busca una única marca autorizada por nombre/alias y reutiliza su UUID. Vincula `act_1906671039972272` a esa organización/marca. Si hay cero coincidencias, ambigüedad o la cuenta ya pertenece a otro destino, se detiene sin duplicar ni trasladar datos. Repetir la misma vinculación no crea otra fila.
4. Elegir un intervalo (30 días por defecto, máximo 93 días inclusive) y pulsar **Sincronizar datos de Meta**. El servidor usa la variable de Production ya configurada; no se introduce el token en el panel ni en el chat. El botón muestra la consulta en curso; SQL impide lecturas simultáneas y aplica una espera mínima de 60 segundos por cuenta.
5. Revisar estado, permisos enumerados si Meta permite consultarlos, fecha, moneda, zona horaria, campañas y estadísticas. Una sincronización correcta con cero campañas muestra un estado vacío real. El éxito significa que la lectura terminó y se guardó completa. Compartir solo el estado/error seguro, nunca el token.

Si falta la migración, Marketing muestra un aviso y mantiene el resto de la aplicación operativo. No es necesario configurar una service-role key para esta integración: se usan sesión, membresía y RPC con permisos controlados.

## Variables existentes y nuevas

| Variable                               | Uso                                                        | Configuración                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `META_ACCESS_TOKEN`                    | Credencial exclusiva de servidor para GET de Marketing API | Vercel → proyecto existente → Settings → Environment Variables → Production. Ya reportada como guardada. Un cambio requiere redeploy. Nunca `NEXT_PUBLIC_`. |
| `META_GRAPH_API_VERSION`               | Opcional, versión fijada de Graph API                      | Por defecto `v23.0`. Se acepta formato `vNN.0`, nunca host o URL arbitrarios. Revisar soporte oficial de la versión antes de cambiarla; redeploy si cambia. |
| Variables públicas Supabase existentes | Sesión y persistencia bajo autorización                    | Se conservan. No añadir un Brand ID ni otro Organization ID fijo.                                                                                           |

La cuenta se configura en Supabase, no mediante una variable global de marca. La arquitectura admite distintas filas de cuentas relacionadas con distintas marcas. En esta fase el panel solo ofrece la vinculación inicial solicitada; incorporar otra cuenta requiere una configuración autorizada, no reutilizar el UUID de CEO para todo el grupo.

## Datos y alcance de la lectura

Único host de transporte: `graph.facebook.com`, HTTPS, `GET`, `Authorization: Bearer` en encabezado, `cache:no-store`, sin seguir redirecciones. No se envían tokens por URL. La paginación reconstruye solicitudes con cursores sobre el host fijo; nunca sigue `paging.next`, que podría contener credenciales. Límite de 20 páginas por recurso, hasta 2.000 filas, con tiempo total acotado. Si no puede obtener todo, no publica una lectura parcial.

Consultas:

- Cuenta: ID/nombre, moneda, zona horaria y estado publicitario.
- `/me/permissions`: solo enumera `ads_read` / `ads_management` concedidos, si el tipo de token permite esa consulta. Una consulta no disponible no se anuncia como permisos comprobados. La lectura correcta de campañas e insights sí verifica acceso efectivo de lectura a esa cuenta.
- Campañas: ID/nombre, estado configurado/efectivo, inicio/fin, objetivo y presupuesto diario/total cuando estén en campaña. Presupuesto ausente o definido en conjuntos de anuncios no se inventa ni se suma.
- Insights agregados por campaña e insights agregados por cuenta para el intervalo: gasto, impresiones, alcance, clics, CPC, CPM, `actions` y `action_values` disponibles. Los valores de acciones se conservan; el panel muestra los eventos `actions` con los nombres originales para no reinterpretarlos como ventas.

El alcance global se obtiene a nivel de cuenta: **no se suman alcances de campañas**. CPC y CPM se muestran tal como los devuelve Meta. No se mezclan monedas. Estado/presupuesto son los actuales al sincronizar, aunque se consulte un intervalo histórico. El intervalo usa la zona horaria publicitaria y los resultados pueden actualizarse posteriormente por atribución de Meta. Campañas históricas presentes solo en insights conservan su ID/nombre real, con estado/presupuesto no disponibles.

No hay cron ni sincronización automática en segundo plano: un administrador inicia cada lectura. No hay endpoints públicos de diagnóstico, creación/edición/pausa de anuncios, cambios de presupuesto ni gasto publicitario.

## Persistencia y seguridad

- `marketing_ad_accounts`: relación única de cuenta Meta con organización y marca existentes, moneda/zona horaria y última lectura correcta. No guarda tokens.
- `marketing_meta_syncs`: intervalo, solicitante, intentos, resultado, permisos enumerados y resumen de cuenta.
- `marketing_meta_campaign_metrics`: campaña y estadísticas originales normalizadas por sincronización.

Las tres tablas usan RLS para lectura de miembros de su organización. Se revocaron escrituras directas de usuarios autenticados. Las RPC de vinculación/inicio/finalización exigen owner/admin; finalizar exige además el mismo solicitante. Las claves compuestas impiden cruces de organización/cuenta. Guardar un snapshot es transaccional. Un error conserva los datos anteriores, identificados con la fecha de lectura; no los sustituye por ceros. No se modifican políticas ni tablas del CRM.

Los fallos se convierten en códigos cerrados (`TOKEN_EXPIRED`, `ACCESS_DENIED`, `RATE_LIMIT`, etc.). No se devuelven, guardan ni registran cuerpos de error Meta, encabezados de autorización, URLs de paginación, stack traces de transporte ni credenciales.

## Errores y autorización sostenible

- **Token ausente:** revisar el nombre exacto y ámbito Production; redeploy.
- **Token vencido/inválido (OAuth 190 / HTTP 401):** renovar la autorización en Meta, actualizar la variable y redeploy. Esto no identifica por sí solo el tipo de token.
- **Acceso denegado:** comprobar `ads_read`, asignación de la cuenta al usuario/usuario del sistema y al negocio/app correctos, además de los requisitos de acceso/revisión aplicables en Meta. Haber solicitado un permiso no significa que esté concedido.
- **Límite de consultas:** esperar y reintentar. No se reintenta automáticamente ni se realizan escrituras publicitarias.
- **Datos inesperados o guardado fallido:** revisar migración, permisos y versión de Graph API. Se conserva el último snapshot correcto.

**No se puede afirmar si el token actual es temporal sin inspeccionar su tipo y vencimiento en Meta.** El panel lo declara no verificado. Revisar en Meta Access Token Debugger, sin copiarlo al chat ni guardarlo en documentación. Para una operación sostenible sobre activos propios, evaluar un usuario del sistema del negocio con la app y cuenta asignadas y privilegios mínimos de lectura, si la configuración de Meta lo permite. Los tokens de usuario de larga duración también vencen; los tokens de sistema pueden revocarse o tener vencimiento según la emisión. Definir responsable, fecha de revisión, rotación y recuperación de acceso. Esta fase no implementa OAuth ni renovación automática. `ads_management` no es necesario para esta lectura y nunca se usa para modificar anuncios.

Referencias oficiales: https://developers.facebook.com/docs/marketing-api/insights/ · https://developers.facebook.com/docs/marketing-api/overview/authentication/ · https://developers.facebook.com/docs/graph-api/guides/versioning/

## CRM y atribución pendiente

Las acciones atribuidas por Meta no crean contactos, oportunidades o ventas. Para recibir prospectos CEO reales, falta comprobar la entrega del formulario/diagnóstico existente al receptor CRM, resolver su fuente autorizada, verificar idempotencia/consentimiento y excluir pruebas. La atribución requiere conservar UTMs/IDs de campaña/formulario y conectar eventos de conversión verificables. Marketing API reporting no activa automáticamente Lead Ads, sus webhooks ni Conversions API. No se modifica n8n, Google Sheets, Gmail ni el diagnóstico CEO.

## Validación

Pruebas con transporte simulado y PostgreSQL aislado: lectura GET exclusiva, host fijo, secreto ausente de salidas/URLs, paginación segura, permisos no enumerables, errores OAuth/permisos/límites, estados vacíos, fechas, vinculación idempotente, RLS, permisos administrativos, enfriamiento y guardado transaccional. Las pruebas simuladas no prueban que el token de Production tenga acceso real. Ejecutar también TypeScript, lint, build y pruebas responsive del Marketing Hub.
