-- SOLO LECTURA. No devuelve claves, emails ni contenido de diagnósticos.
select jsonb_build_object(
 'sources',(select coalesce(jsonb_agg(jsonb_build_object('key',source_key,'provider',provider,'enabled',enabled,'organization_id',organization_id,'brand_id',brand_id)),'[]') from public.crm_capture_sources where source_key='ceo-rentable-diagnostico'),
 'commercial_function_ready',to_regprocedure('public.crm_ingest_commercial_source(text,text,jsonb,text)') is not null
) readiness;
