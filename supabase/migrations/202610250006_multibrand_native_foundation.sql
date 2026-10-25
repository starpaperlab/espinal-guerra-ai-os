-- Multibrand configuration and native outbox only. No AI/email worker is activated.
begin;
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='crm_leads' and column_name='capture_metadata') then raise exception 'Apply migration 005 before native infrastructure'; end if;
end $$;
create table public.crm_enterprise_settings (
 singleton boolean primary key default true check(singleton), organization_id uuid not null unique references public.organizations(id),
 configured_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.crm_capture_sources (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null,
 source_key text not null unique check(source_key ~ '^[a-z0-9][a-z0-9_-]{2,99}$'),
 name text not null check(length(name) between 1 and 160), provider text not null check(provider in ('native','n8n','signed_backend')),
 enabled boolean not null default false check(provider<>'native' or not enabled), form_schema jsonb not null default '{"fields":[]}'::jsonb check(jsonb_typeof(form_schema)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,brand_id,id), foreign key(organization_id,brand_id) references public.brands(organization_id,id)
);
create table public.native_automation_definitions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null,
 definition_key text not null check(length(definition_key) between 1 and 100), name text not null check(length(name) between 1 and 160),
 status text not null default 'draft' check(status in ('draft','paused')),
 trigger_event text not null default 'lead.captured', plan jsonb not null default '{"version":1,"conditions":[],"steps":[]}'::jsonb check(jsonb_typeof(plan)='object'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,brand_id,definition_key), foreign key(organization_id,brand_id) references public.brands(organization_id,id)
);
create table public.native_automation_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, lead_id uuid not null,
 event_key text not null, kind text not null check(kind in ('lead.captured','opportunity.stage_changed','conversion.recorded')),
 payload jsonb not null default '{}'::jsonb, is_test boolean not null default false,
 status text not null default 'pending' check(status in ('pending','leased','completed','failed')),
 available_at timestamptz not null default now(), lease_until timestamptz, lease_token uuid,
 attempts integer not null default 0 check(attempts between 0 and 3), last_error_code text,
 created_at timestamptz not null default now(), unique(organization_id,event_key), unique(organization_id,brand_id,id),
 foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id)
);
create index native_automation_queue on public.native_automation_events(available_at,created_at) where status in ('pending','leased');
create table public.native_automation_runs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, event_id uuid not null,
 lease_token uuid not null unique, status text not null check(status in ('running','completed','failed','lease_expired')),
 error_code text, started_at timestamptz not null default now(), finished_at timestamptz,
 foreign key(organization_id,brand_id,event_id) references public.native_automation_events(organization_id,brand_id,id)
);
create table public.crm_conversions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, lead_id uuid not null,
 conversion_key text not null, kind text not null check(kind in ('trial_started','subscription','opportunity_won')),
 amount numeric(16,2) check(amount>=0), currency text check(currency ~ '^[A-Z]{3}$'),
 is_test boolean not null default false, occurred_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,conversion_key), foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id)
);
create trigger a_crm_scope before insert or update on public.crm_conversions for each row execute function public.crm_scope_guard();
create trigger z_crm_history before insert or update on public.crm_conversions for each row execute function public.crm_write_history();

do $$ declare t text; begin
 foreach t in array array['crm_enterprise_settings','crm_capture_sources','native_automation_definitions','native_automation_events','native_automation_runs','crm_conversions'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy member_read on public.%I for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid())))',t,t);
 end loop;
end $$;
-- Configuration writes require admin membership AND the operator-approved enterprise binding.
grant insert,update on public.crm_capture_sources,public.native_automation_definitions to authenticated;
create policy admin_sources on public.crm_capture_sources for all to authenticated
 using(exists(select 1 from public.organization_members m join public.crm_enterprise_settings e on e.organization_id=m.organization_id where m.organization_id=crm_capture_sources.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')))
 with check(exists(select 1 from public.organization_members m join public.crm_enterprise_settings e on e.organization_id=m.organization_id where m.organization_id=crm_capture_sources.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));
create policy admin_definitions on public.native_automation_definitions for all to authenticated
 using(exists(select 1 from public.organization_members m join public.crm_enterprise_settings e on e.organization_id=m.organization_id where m.organization_id=native_automation_definitions.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')))
 with check(exists(select 1 from public.organization_members m join public.crm_enterprise_settings e on e.organization_id=m.organization_id where m.organization_id=native_automation_definitions.organization_id and m.user_id=(select auth.uid()) and m.role in ('owner','admin')));

-- Bootstrap is SQL-operator/server-only. No public "become admin" or first-claim endpoint.
create function public.crm_bootstrap_enterprise(p_org uuid default null,p_admin uuid default null,p_allow_create boolean default false,p_grant_admin boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare org uuid=p_org; admin_id uuid=p_admin; org_count integer; admin_count integer; created_org boolean=false; created_corporate boolean=false; r record; brand uuid; matches integer; ceo uuid; result jsonb;
begin
 perform pg_advisory_xact_lock(hashtextextended('espinal-guerra-enterprise-bootstrap',0));
 if org is null then
  select count(*),(array_agg(id))[1] into org_count,org from public.organizations where lower(trim(name)) in ('espinal guerra','grupo empresarial espinal guerra','espinal guerra ai os');
  if org_count>1 then raise exception 'Ambiguous enterprise organizations; pass the audited existing UUID' using errcode='23514'; end if;
  if org_count=0 then
   if not p_allow_create then raise exception 'Organization not confirmed; pass the audited UUID or explicitly authorize creation' using errcode='23514'; end if;
   if exists(select 1 from public.brands where slug in ('ceo-rentable-os','plannerlab','star-paper-lab','emprendedora-digital-ia','emprendedora-digital-con-ia')) then raise exception 'Existing brands must be reconciled before creating an organization' using errcode='23514'; end if;
   if admin_id is null or not exists(select 1 from auth.users where id=admin_id) then raise exception 'An existing authorized administrator UUID is required' using errcode='23514'; end if;
   insert into public.organizations(name) values('Espinal Guerra') returning id into org; created_org=true;
   insert into public.organization_members(organization_id,user_id,role) values(org,admin_id,'owner');
  end if;
 end if;
 if not exists(select 1 from public.organizations where id=org) then raise exception 'Organization not found' using errcode='23503'; end if;
 if exists(select 1 from public.crm_enterprise_settings where organization_id<>org) then raise exception 'Another enterprise is already bound; operator review required' using errcode='23514'; end if;
 if admin_id is null then
  select count(*),(array_agg(user_id))[1] into admin_count,admin_id from public.organization_members where organization_id=org and role in ('owner','admin');
  if admin_count<>1 then raise exception 'Select the audited existing administrator UUID' using errcode='23514'; end if;
 end if;
 if not exists(select 1 from auth.users where id=admin_id) then raise exception 'Administrator not found' using errcode='23503'; end if;
 if not exists(select 1 from public.organization_members where organization_id=org and user_id=admin_id and role in ('owner','admin')) then
  if not p_grant_admin then raise exception 'Administrator membership missing; explicit operator grant required' using errcode='42501'; end if;
  insert into public.organization_members(organization_id,user_id,role) values(org,admin_id,'admin') on conflict(organization_id,user_id) do update set role=case when organization_members.role='owner' then 'owner' else 'admin' end;
 end if;
 for r in select * from (values
  ('espinal-guerra','Espinal Guerra',array['espinal-guerra','grupo-espinal-guerra','espinal-guerra-corporativo']),
  ('ceo-rentable-os','CEO Rentable OS',array['ceo-rentable-os','ceo-rentable']),
  ('plannerlab','PlannerLab',array['plannerlab','planner-lab']),
  ('star-paper-lab','Star Paper Lab',array['star-paper-lab','starpaperlab']),
  ('emprendedora-digital-ia','Emprendedora Digital con IA',array['emprendedora-digital-ia','emprendedora-digital-con-ia'])
 ) expected(slug,name,aliases) loop
  if exists(select 1 from public.brands where organization_id<>org and (slug=any(r.aliases) or lower(trim(name))=lower(r.name))) then raise exception 'Expected brand exists in another organization; do not move CRM records automatically' using errcode='23514'; end if;
  select count(*),(array_agg(id))[1] into matches,brand from public.brands where organization_id=org and (slug=any(r.aliases) or lower(trim(name))=lower(r.name));
  if matches>1 then raise exception 'Ambiguous duplicate brand identity; operator review required' using errcode='23514'; end if;
  if matches=0 then
   if r.slug<>'espinal-guerra' and not created_org then raise exception 'An expected existing brand is missing; review audit before creating copies' using errcode='23514'; end if;
   insert into public.brands(organization_id,slug,name) values(org,r.slug,r.name) returning id into brand;
   if r.slug='espinal-guerra' then created_corporate=true; end if;
  end if;
  if r.slug='ceo-rentable-os' then ceo=brand; end if;
 end loop;
 insert into public.crm_enterprise_settings(singleton,organization_id,configured_by) values(true,org,admin_id) on conflict(singleton) do nothing;
 insert into public.crm_capture_sources(organization_id,brand_id,source_key,name,provider,enabled,form_schema)
 values(org,ceo,'ceo-rentable-diagnostico','Diagnóstico existente CEO Rentable','signed_backend',false,'{"fields":[],"reference":"existing_ceo_diagnostic","renderer":"not_implemented"}'::jsonb)
 on conflict(source_key) do nothing;
 if not exists(select 1 from public.crm_capture_sources where source_key='ceo-rentable-diagnostico' and organization_id=org and brand_id=ceo and provider='signed_backend') then raise exception 'Reserved capture source conflicts with the audited brand' using errcode='23514'; end if;
 insert into public.native_automation_definitions(organization_id,brand_id,definition_key,name,plan)
 values(org,ceo,'ceo-diagnostic-journey','Diagnóstico CEO Rentable · borrador',
 '{"version":1,"conditions":[],"steps":[{"kind":"capture"},{"kind":"evaluation"},{"kind":"diagnostic_email","requires_approval":true},{"kind":"trial_invitation","days":10,"requires_approval":true},{"kind":"followup","requires_approval":true},{"kind":"subscription_conversion"}],"execution":"not_implemented"}'::jsonb)
 on conflict(organization_id,brand_id,definition_key) do nothing;
 select jsonb_build_object('organization_id',org,'organization_name',o.name,'organization_created',created_org,'admin_membership_confirmed',true,'corporate_brand_created',created_corporate,'brands',(select jsonb_agg(jsonb_build_object('id',b.id,'slug',b.slug,'name',b.name) order by b.name) from public.brands b where b.organization_id=org)) into result from public.organizations o where o.id=org;
 return result;
end $$;
revoke all on function public.crm_bootstrap_enterprise(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.crm_bootstrap_enterprise(uuid,uuid,boolean,boolean) to service_role;

create function public.crm_reconcile_enterprise(p_org uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Administrator membership required' using errcode='42501'; end if;
 if not exists(select 1 from public.crm_enterprise_settings where organization_id=p_org) then raise exception 'Operator enterprise binding required first' using errcode='42501'; end if;
 return public.crm_bootstrap_enterprise(p_org,auth.uid(),false,false);
end $$;
revoke all on function public.crm_reconcile_enterprise(uuid) from public,anon;
grant execute on function public.crm_reconcile_enterprise(uuid) to authenticated;

-- Immutable destination: changing a source never retargets existing CRM data or events.
create function public.crm_capture_source_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if TG_OP='UPDATE' and (new.id<>old.id or new.organization_id<>old.organization_id or new.brand_id<>old.brand_id or new.provider<>old.provider or new.source_key<>old.source_key) then raise exception 'Capture identity is immutable; create a separate reviewed source' using errcode='23514'; end if;
 new.updated_at=now();return new;
end $$;
create trigger capture_source_guard before update on public.crm_capture_sources for each row execute function public.crm_capture_source_guard();

-- Minimal outbox, atomic with the CRM transaction; no external action is dispatched.
create function public.crm_enqueue_native_event() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare lead uuid; event_kind text; key text;
begin
 if TG_TABLE_NAME='crm_leads' then lead=new.id; event_kind='lead.captured'; key='lead:'||new.id::text;
 elsif TG_TABLE_NAME='crm_opportunities' then
  if TG_OP<>'UPDATE' then return new; end if;
  if new.stage=old.stage then return new; end if;
  lead=new.lead_id; event_kind='opportunity.stage_changed'; key='opportunity:'||new.id::text||':'||gen_random_uuid()::text;
 else lead=new.lead_id;event_kind='conversion.recorded';key='conversion:'||new.id::text; end if;
 insert into public.native_automation_events(organization_id,brand_id,lead_id,event_key,kind,payload,is_test)
 values(new.organization_id,new.brand_id,lead,key,event_kind,jsonb_build_object('entity_id',new.id,'kind',event_kind),new.is_test)
 on conflict(organization_id,event_key) do nothing;
 return new;
end $$;
revoke all on function public.crm_enqueue_native_event() from public;
create trigger native_lead_created after insert on public.crm_leads for each row execute function public.crm_enqueue_native_event();
create trigger native_opportunity_changed after update on public.crm_opportunities for each row execute function public.crm_enqueue_native_event();
create trigger native_conversion_created after insert on public.crm_conversions for each row execute function public.crm_enqueue_native_event();

-- Lease tokens prevent stale workers completing newer attempts. No HTTP worker is installed.
create function public.native_claim_event(p_org uuid,p_include_tests boolean default false) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare item public.native_automation_events; token uuid=gen_random_uuid();
begin
 update public.native_automation_runs r set status='lease_expired',finished_at=now() where status='running' and exists(select 1 from public.native_automation_events e where e.id=r.event_id and e.organization_id=p_org and e.status='leased' and e.lease_until<now());
 update public.native_automation_events set status='failed',last_error_code='MAX_ATTEMPTS',lease_token=null,lease_until=null where organization_id=p_org and status='leased' and lease_until<now() and attempts>=3;
 select * into item from public.native_automation_events where organization_id=p_org and attempts<3 and available_at<=now() and (p_include_tests or not is_test) and (status='pending' or (status='leased' and lease_until<now())) order by available_at,created_at for update skip locked limit 1;
 if item.id is null then return null; end if;
 update public.native_automation_events set status='leased',lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1 where id=item.id returning * into item;
 insert into public.native_automation_runs(organization_id,brand_id,event_id,lease_token,status) values(item.organization_id,item.brand_id,item.id,token,'running');
 return to_jsonb(item);
end $$;
create function public.native_finish_event(p_org uuid,p_id uuid,p_token uuid,p_success boolean,p_error_code text default null) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare item public.native_automation_events;
begin
 if p_error_code is not null and p_error_code !~ '^[A-Z0-9_]{1,64}$' then raise exception 'Only non-sensitive error codes may be stored' using errcode='23514'; end if;
 select * into item from public.native_automation_events where organization_id=p_org and id=p_id and status='leased' and lease_token=p_token and lease_until>=now() for update;
 if item.id is null then return false; end if;
 update public.native_automation_runs set status=case when p_success then 'completed' else 'failed' end,error_code=p_error_code,finished_at=now() where event_id=p_id and lease_token=p_token;
 update public.native_automation_events set status=case when p_success then 'completed' when attempts>=3 then 'failed' else 'pending' end,last_error_code=p_error_code,available_at=case when p_success then available_at else now()+interval '1 minute' end,lease_token=null,lease_until=null where id=p_id;
 return true;
end $$;
revoke all on function public.native_claim_event(uuid,boolean),public.native_finish_event(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.native_claim_event(uuid,boolean),public.native_finish_event(uuid,uuid,uuid,boolean,text) to service_role;

create or replace function public.crm_ingest_lead(p_organization_id uuid,p_event jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior public.crm_inbound_events; lead uuid; contact uuid; brand uuid=(p_event->>'brand_id')::uuid; ingestion_provider text=coalesce(p_event->>'_ingestion_provider','n8n');
begin
 if ingestion_provider not in ('n8n','signed_backend','native') then raise exception 'Unsupported provider' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||ingestion_provider||':'||(p_event->>'external_id'),0));
 select * into prior from public.crm_inbound_events where organization_id=p_organization_id and crm_inbound_events.provider=ingestion_provider and event_id=p_event->>'event_id';
 if prior.id is not null then
  if prior.payload_hash<>p_hash then raise exception 'Event id reused with different content' using errcode='23505'; end if;
  return jsonb_build_object('lead_id',prior.lead_id,'duplicate',true,'contract_version',5);
 end if;
 if not exists(select 1 from public.brands where organization_id=p_organization_id and id=brand) then raise exception 'Unknown authorized brand' using errcode='23503'; end if;
 select id into lead from public.crm_leads where organization_id=p_organization_id and brand_id=brand and source_system=ingestion_provider and external_id=p_event->>'external_id';
 if lead is null then
  insert into public.crm_contacts(organization_id,brand_id,name,company,email,phone,channel,notes,is_test)
  values(p_organization_id,brand,p_event->'contact'->>'name',coalesce(p_event->'contact'->>'company',''),coalesce(p_event->'contact'->>'email',''),coalesce(p_event->'contact'->>'phone',''),p_event->>'source',coalesce(p_event->>'message',''),(p_event->>'is_test')::boolean) returning id into contact;
  insert into public.crm_leads(organization_id,brand_id,contact_id,source,campaign,budget,urgency,service,need,score,classification,ai_problem,ai_opportunity,ai_recommendation,ai_metadata,capture_metadata,next_action,evaluated_at,captured_at,source_system,external_id)
  values(p_organization_id,brand,contact,p_event->>'source',coalesce(p_event->>'campaign',''),coalesce(p_event->>'budget',''),coalesce(p_event->>'urgency',''),coalesce(p_event->>'service',''),coalesce(p_event->>'need',''),(p_event->>'score')::integer,p_event->>'classification',coalesce(p_event->>'problem',''),coalesce(p_event->>'opportunity',''),coalesce(p_event->>'recommendation',''),jsonb_build_object('content_kind','ai_recommendation','priority',p_event->'priority','route_to_sales',p_event->'route_to_sales','response_suggestion',coalesce(p_event->>'response_suggestion',''),'scoring_breakdown',coalesce(p_event->'scoring_breakdown','{}'::jsonb)),jsonb_build_object('monthly_leads',p_event->'monthly_leads','event_context',p_event->'capture_context'),coalesce(p_event->>'next_action',''),(p_event->>'evaluated_at')::timestamptz,(p_event->>'occurred_at')::timestamptz,ingestion_provider,p_event->>'external_id') returning id into lead;
 end if;
 insert into public.crm_inbound_events(organization_id,provider,event_id,payload_hash,lead_id) values(p_organization_id,ingestion_provider,p_event->>'event_id',p_hash,lead);
 return jsonb_build_object('lead_id',lead,'duplicate',false,'contract_version',5);
end $$;
revoke all on function public.crm_ingest_lead(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_ingest_lead(uuid,jsonb,text) to service_role;

-- Resolve destinations from the operator-approved enterprise and source, never client org/brand.
create function public.crm_ingest_configured_source(p_source_key text,p_provider text,p_event jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare source public.crm_capture_sources; event jsonb;
begin
 select s.* into source from public.crm_capture_sources s join public.crm_enterprise_settings e on e.organization_id=s.organization_id where s.source_key=p_source_key and s.provider=p_provider and s.enabled;
 if source.id is null then raise exception 'Authorized capture source not available' using errcode='23503'; end if;
 if p_event->>'capture_source_key' is distinct from p_source_key then raise exception 'Signed source mismatch' using errcode='23503'; end if;
 if p_event->>'brand_id' is not null and (p_event->>'brand_id')::uuid<>source.brand_id then raise exception 'Brand differs from configured source' using errcode='23503'; end if;
 event=p_event||jsonb_build_object('brand_id',source.brand_id,'_ingestion_provider',p_provider,
  'event_id',source.id::text||':'||(p_event->>'event_id'),'external_id',source.id::text||':'||(p_event->>'external_id'));
 return public.crm_ingest_lead(source.organization_id,event,p_hash);
end $$;
revoke all on function public.crm_ingest_configured_source(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_ingest_configured_source(text,text,jsonb,text) to service_role;
create or replace function public.crm_inbound_contract_version() returns integer language sql immutable security invoker set search_path=pg_catalog as $$ select 5 $$;
revoke all on function public.crm_inbound_contract_version() from public,anon,authenticated;
grant execute on function public.crm_inbound_contract_version() to service_role;
notify pgrst, 'reload schema';
commit;
