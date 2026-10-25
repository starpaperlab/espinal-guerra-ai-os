-- SOLO LECTURA. Un resultado JSON, sin claves, correos, cookies ni contraseñas.
-- Ejecutar en el proyecto espinal-guerra-ai-os existente con el SQL Editor.
select jsonb_build_object(
 'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by created_at) from public.organizations),'[]'::jsonb),
 'organization_members',coalesce((select jsonb_agg(jsonb_build_object('organization_id',organization_id,'user_id',user_id,'role',role)) from public.organization_members),'[]'::jsonb),
 'brands',coalesce((select jsonb_agg(jsonb_build_object('id',id,'organization_id',organization_id,'slug',slug,'name',name) order by organization_id,name) from public.brands),'[]'::jsonb),
 'capture_contract_version',public.crm_inbound_contract_version(),
 'rls',coalesce((select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('organizations','organization_members','brands','crm_contacts','crm_leads','crm_inbound_events')),'[]'::jsonb)
) as audit;
