-- SOLO LECTURA. Ejecutar en ambos proyectos existentes y anotar el nombre
-- del proyecto visible en Supabase. No devuelve claves ni datos de contactos.
select jsonb_build_object(
 'ceo',jsonb_build_object(
  'leads',to_regclass('public.leads') is not null,
  'users',to_regclass('public.users') is not null,
  'paypal_subscriptions',to_regclass('public.paypal_subscriptions') is not null,
  'commercial_events',to_regclass('public.ceo_commercial_events') is not null
 ),
 'ai_os',jsonb_build_object(
  'organizations',to_regclass('public.organizations') is not null,
  'brands',to_regclass('public.brands') is not null,
  'crm_contacts',to_regclass('public.crm_contacts') is not null,
  'crm_leads',to_regclass('public.crm_leads') is not null,
  'capture_metadata_005',exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_leads' and column_name='capture_metadata'),
  'enterprise_settings_006',to_regclass('public.crm_enterprise_settings') is not null,
  'capture_sources_006',to_regclass('public.crm_capture_sources') is not null,
  'automation_definitions_006',to_regclass('public.native_automation_definitions') is not null,
  'automation_events_006',to_regclass('public.native_automation_events') is not null,
  'automation_runs_006',to_regclass('public.native_automation_runs') is not null,
  'conversions_006',to_regclass('public.crm_conversions') is not null,
  'commercial_events_008',to_regclass('public.crm_commercial_events') is not null
 )
) as preflight;
