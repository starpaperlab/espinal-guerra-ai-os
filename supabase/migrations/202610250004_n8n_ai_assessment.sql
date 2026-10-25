-- Preserve received AI recommendations without executing or confirming them.
begin;
alter table public.crm_leads add column if not exists ai_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(ai_metadata)='object');
create or replace function public.crm_ingest_lead(p_organization_id uuid,p_event jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior public.crm_inbound_events; lead uuid; contact uuid; brand uuid=(p_event->>'brand_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||'n8n:'||(p_event->>'external_id'),0));
 select * into prior from public.crm_inbound_events where organization_id=p_organization_id and provider='n8n' and event_id=p_event->>'event_id';
 if prior.id is not null then
  if prior.payload_hash<>p_hash then raise exception 'Event id reused with different content' using errcode='23505'; end if;
  return jsonb_build_object('lead_id',prior.lead_id,'duplicate',true,'contract_version',3);
 end if;
 if not exists(select 1 from public.brands where organization_id=p_organization_id and id=brand) then raise exception 'Unknown authorized brand' using errcode='23503'; end if;
 select id into lead from public.crm_leads where organization_id=p_organization_id and brand_id=brand and source_system='n8n' and external_id=p_event->>'external_id';
 if lead is null then
  insert into public.crm_contacts(organization_id,brand_id,name,company,email,phone,channel,notes,is_test)
  values(p_organization_id,brand,p_event->'contact'->>'name',coalesce(p_event->'contact'->>'company',''),coalesce(p_event->'contact'->>'email',''),coalesce(p_event->'contact'->>'phone',''),p_event->>'source',coalesce(p_event->>'message',''),(p_event->>'is_test')::boolean) returning id into contact;
  insert into public.crm_leads(organization_id,brand_id,contact_id,source,campaign,budget,urgency,service,need,score,classification,ai_problem,ai_opportunity,ai_recommendation,ai_metadata,next_action,evaluated_at,captured_at,source_system,external_id)
  values(p_organization_id,brand,contact,p_event->>'source',coalesce(p_event->>'campaign',''),coalesce(p_event->>'budget',''),coalesce(p_event->>'urgency',''),coalesce(p_event->>'service',''),coalesce(p_event->>'need',''),(p_event->>'score')::integer,p_event->>'classification',coalesce(p_event->>'problem',''),coalesce(p_event->>'opportunity',''),coalesce(p_event->>'recommendation',''),jsonb_build_object('content_kind','ai_recommendation','priority',p_event->'priority','route_to_sales',p_event->'route_to_sales','response_suggestion',coalesce(p_event->>'response_suggestion',''),'scoring_breakdown',coalesce(p_event->'scoring_breakdown','{}'::jsonb)),coalesce(p_event->>'next_action',''),(p_event->>'evaluated_at')::timestamptz,(p_event->>'occurred_at')::timestamptz,'n8n',p_event->>'external_id') returning id into lead;
 end if;
 insert into public.crm_inbound_events(organization_id,provider,event_id,payload_hash,lead_id) values(p_organization_id,'n8n',p_event->>'event_id',p_hash,lead);
 return jsonb_build_object('lead_id',lead,'duplicate',false,'contract_version',3);
end $$;
revoke all on function public.crm_ingest_lead(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_ingest_lead(uuid,jsonb,text) to service_role;
-- Version handshake prevents new fields being silently dropped before migration.
create or replace function public.crm_inbound_contract_version() returns integer
language sql immutable security invoker set search_path=pg_catalog as $$ select 3 $$;
revoke all on function public.crm_inbound_contract_version() from public,anon,authenticated;
grant execute on function public.crm_inbound_contract_version() to service_role;
notify pgrst, 'reload schema';
commit;
