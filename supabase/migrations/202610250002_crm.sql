-- Additive CRM. Apply once to the existing project after reviewing its live schema.
begin;
-- Fail before any changes if the existing foundation does not match the versioned contract.
do $$ begin
 if to_regclass('public.organizations') is null or to_regclass('public.organization_members') is null or to_regclass('public.brands') is null then
  raise exception 'Existing foundation missing: inspect live schema before applying CRM';
 end if;
end $$;
create unique index if not exists brands_org_id_crm_idx on public.brands(organization_id,id);

create table public.crm_contacts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 brand_id uuid not null, name text not null check(length(name) between 1 and 160), company text not null default '' check(length(company)<=200),
 email text not null default '' check(length(email)<=254), phone text not null default '' check(length(phone)<=60),
 channel text not null default 'manual' check(length(channel)<=100), tags text[] not null default '{}', notes text not null default '' check(length(notes)<=10000),
 status text not null default 'active' check(status in ('active','inactive','client')), is_test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,brand_id,id), foreign key(organization_id,brand_id) references public.brands(organization_id,id)
);
create table public.crm_leads (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), brand_id uuid not null,
 contact_id uuid not null, source text not null default 'manual' check(length(source)<=100), campaign text not null default '' check(length(campaign)<=200),
 service text not null default '' check(length(service)<=300), need text not null default '' check(length(need)<=10000),
 budget text not null default '' check(length(budget)<=300), urgency text not null default '' check(length(urgency)<=300),
 score integer check(score between 0 and 100), classification text check(classification in ('HOT','WARM','COLD')),
 stage text not null default 'nuevo' check(stage in ('nuevo','contactado','interesado','propuesta_enviada','negociacion','ganado','perdido')),
 owner_id uuid references auth.users(id), next_action text not null default '' check(length(next_action)<=2000), follow_up_at timestamptz,
 ai_problem text not null default '', ai_opportunity text not null default '', ai_recommendation text not null default '', evaluated_at timestamptz,
 captured_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 is_test boolean not null default false, request_id uuid, source_system text, external_id text,
 check((score is null and classification is null and evaluated_at is null) or (score is not null and classification is not null and evaluated_at is not null)),
 unique(organization_id,brand_id,id), unique(organization_id,request_id), unique(organization_id,brand_id,source_system,external_id),
 constraint crm_leads_contact_fk foreign key(organization_id,brand_id,contact_id) references public.crm_contacts(organization_id,brand_id,id)
);
create table public.crm_opportunities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, lead_id uuid not null,
 service text not null check(length(service) between 1 and 300), estimated_value numeric(16,2) not null default 0 check(estimated_value>=0),
 currency text not null default 'DOP' check(currency ~ '^[A-Z]{3}$'),
 stage text not null default 'nuevo' check(stage in ('nuevo','contactado','interesado','propuesta_enviada','negociacion','ganado','perdido')),
 probability integer not null default 0 check(probability between 0 and 100), expected_close date,
 next_action text not null default '' check(length(next_action)<=2000), closed_value numeric(16,2) check(closed_value>=0),
 outcome text generated always as (case when stage='ganado' then 'won' when stage='perdido' then 'lost' else 'open' end) stored,
 request_id uuid not null, is_test boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check((stage='ganado' and closed_value is not null) or (stage<>'ganado' and closed_value is null)),
 unique(organization_id,brand_id,id), unique(organization_id,request_id),
 constraint crm_opportunities_lead_fk foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id)
);
create table public.crm_activities (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, lead_id uuid not null, opportunity_id uuid,
 kind text not null check(kind in ('llamada','correo','whatsapp','mensaje','reunion','tarea','seguimiento','nota')),
 title text not null check(length(title) between 1 and 200), notes text not null default '' check(length(notes)<=10000),
 due_at timestamptz, completed_at timestamptz, request_id uuid not null, is_test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,request_id),
 foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id),
 foreign key(organization_id,brand_id,opportunity_id) references public.crm_opportunities(organization_id,brand_id,id)
);
create table public.crm_proposals (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, brand_id uuid not null, lead_id uuid not null,
 title text not null check(length(title) between 1 and 200), items text not null default '', amount numeric(16,2) not null check(amount>=0),
 currency text not null check(currency ~ '^[A-Z]{3}$'), status text not null default 'draft' check(status in ('draft','sent','accepted','rejected','expired')),
 issued_at date, valid_until date, request_id uuid not null, is_test boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organization_id,request_id),
 check(valid_until is null or issued_at is null or valid_until>=issued_at),
 foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id)
);
create table public.crm_history (
 id bigint generated always as identity primary key, organization_id uuid not null, brand_id uuid not null,
 entity_type text not null, entity_id uuid not null, lead_id uuid, action text not null,
 actor_id uuid, changed_at timestamptz not null default now(), before_data jsonb, after_data jsonb,
 foreign key(organization_id,brand_id) references public.brands(organization_id,id)
);
create table public.crm_inbound_events (
 id bigint generated always as identity primary key, organization_id uuid not null references public.organizations(id),
 provider text not null, event_id text not null, payload_hash text not null, lead_id uuid not null references public.crm_leads(id),
 received_at timestamptz not null default now(), unique(organization_id,provider,event_id)
);

-- Every relationship is scoped by both organization and brand; changing scope is forbidden.
create function public.crm_scope_guard() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare test_flag boolean;
begin
 if TG_OP='UPDATE' and (new.organization_id<>old.organization_id or new.brand_id<>old.brand_id or new.id<>old.id or new.is_test<>old.is_test) then
  raise exception 'CRM scope and test provenance are immutable' using errcode='23514';
 end if;
 if TG_TABLE_NAME='crm_contacts' then return new; end if;
 if TG_TABLE_NAME='crm_leads' then
  if TG_OP='UPDATE' and new.contact_id<>old.contact_id then raise exception 'Contact provenance is immutable' using errcode='23514'; end if;
  select is_test into test_flag from public.crm_contacts where organization_id=new.organization_id and brand_id=new.brand_id and id=new.contact_id;
  if new.owner_id is not null and not exists(select 1 from public.organization_members where organization_id=new.organization_id and user_id=new.owner_id) then raise exception 'Owner must belong to organization' using errcode='23514'; end if;
 else
  if TG_OP='UPDATE' and new.lead_id<>old.lead_id then raise exception 'Lead provenance is immutable' using errcode='23514'; end if;
  select is_test into test_flag from public.crm_leads where organization_id=new.organization_id and brand_id=new.brand_id and id=new.lead_id;
  if TG_TABLE_NAME='crm_activities' then
   if new.opportunity_id is not null and not exists(select 1 from public.crm_opportunities where id=new.opportunity_id and organization_id=new.organization_id and brand_id=new.brand_id and lead_id=new.lead_id) then raise exception 'Activity opportunity must belong to lead' using errcode='23514'; end if;
  end if;
 end if;
 if test_flag is null then raise exception 'Invalid parent scope' using errcode='23503'; end if;
 new.is_test=test_flag;
 return new;
end $$;
create function public.crm_write_history() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare lead uuid;
begin
 if TG_OP='UPDATE' then new.updated_at=now(); end if;
 if TG_TABLE_NAME='crm_leads' then lead=new.id;
 elsif TG_TABLE_NAME<>'crm_contacts' then lead=new.lead_id; end if;
 insert into public.crm_history(organization_id,brand_id,entity_type,entity_id,lead_id,action,actor_id,before_data,after_data)
 values(new.organization_id,new.brand_id,TG_TABLE_NAME,new.id,lead,TG_OP,auth.uid(),case when TG_OP='UPDATE' then to_jsonb(old) end,to_jsonb(new));
 return new;
end $$;
revoke all on function public.crm_write_history() from public;

do $$ declare t text; begin
 foreach t in array array['crm_contacts','crm_leads','crm_opportunities','crm_activities','crm_proposals'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  execute format('create policy crm_member_access on public.%I for all to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid()))) with check (exists(select 1 from public.organization_members m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid())))',t,t,t);
  execute format('create trigger a_crm_scope before insert or update on public.%I for each row execute function public.crm_scope_guard()',t);
  execute format('create trigger z_crm_history before insert or update on public.%I for each row execute function public.crm_write_history()',t);
  execute format('create index on public.%I(organization_id,brand_id,created_at desc)',t);
 end loop;
end $$;
alter table public.crm_history enable row level security;
alter table public.crm_inbound_events enable row level security;
revoke all on public.crm_history, public.crm_inbound_events from anon,authenticated;
grant select on public.crm_history to authenticated;
grant all on public.crm_history,public.crm_inbound_events to service_role;
grant usage,select on public.crm_history_id_seq,public.crm_inbound_events_id_seq to service_role;
create policy crm_history_members on public.crm_history for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=crm_history.organization_id and m.user_id=(select auth.uid())));
create index crm_history_scope on public.crm_history(organization_id,lead_id,changed_at desc);
create index crm_leads_follow_up on public.crm_leads(organization_id,follow_up_at) where follow_up_at is not null;
create index crm_activities_due on public.crm_activities(organization_id,due_at) where completed_at is null;

-- One transaction for manual contact + lead; request UUID handles double submit/retry.
create function public.crm_create_lead(p_organization_id uuid,p_input jsonb,p_request_id uuid) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare lead uuid; contact uuid; brand uuid=(p_input->>'brand_id')::uuid;
begin
 if p_request_id is null or p_organization_id is null then raise exception 'Request and organization are required' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||p_request_id::text,0));
 select id into lead from public.crm_leads where organization_id=p_organization_id and request_id=p_request_id;
 if lead is not null then return lead; end if;
 insert into public.crm_contacts(organization_id,brand_id,name,company,email,phone,channel,tags,notes,is_test)
 values(p_organization_id,brand,p_input->>'name',coalesce(p_input->>'company',''),coalesce(p_input->>'email',''),coalesce(p_input->>'phone',''),coalesce(p_input->>'source','manual'),array(select jsonb_array_elements_text(coalesce(p_input->'tags','[]'))),coalesce(p_input->>'notes',''),coalesce((p_input->>'is_test')::boolean,false)) returning id into contact;
 insert into public.crm_leads(organization_id,brand_id,contact_id,source,campaign,service,need,budget,urgency,next_action,follow_up_at,owner_id,request_id)
 values(p_organization_id,brand,contact,coalesce(p_input->>'source','manual'),coalesce(p_input->>'campaign',''),coalesce(p_input->>'service',''),coalesce(p_input->>'need',''),coalesce(p_input->>'budget',''),coalesce(p_input->>'urgency',''),coalesce(p_input->>'next_action',''),nullif(p_input->>'follow_up_at','')::timestamptz,nullif(p_input->>'owner_id','')::uuid,p_request_id) returning id into lead;
 return lead;
end $$;
create function public.crm_update_lead(p_organization_id uuid,p_id uuid,p_input jsonb) returns uuid language plpgsql security invoker set search_path=pg_catalog,public as $$
declare item public.crm_leads;
begin
 select * into item from public.crm_leads where organization_id=p_organization_id and id=p_id for update;
 if item.id is null then raise exception 'Lead not found' using errcode='42501'; end if;
 update public.crm_contacts set name=p_input->>'name',company=p_input->>'company',email=p_input->>'email',phone=p_input->>'phone',channel=p_input->>'source',notes=p_input->>'notes',tags=array(select jsonb_array_elements_text(p_input->'tags')) where organization_id=p_organization_id and brand_id=item.brand_id and id=item.contact_id;
 update public.crm_leads set source=p_input->>'source',service=p_input->>'service',need=p_input->>'need',budget=p_input->>'budget',urgency=p_input->>'urgency',campaign=p_input->>'campaign',stage=p_input->>'stage',next_action=p_input->>'next_action',follow_up_at=nullif(p_input->>'follow_up_at','')::timestamptz,owner_id=nullif(p_input->>'owner_id','')::uuid where organization_id=p_organization_id and id=p_id;
 return p_id;
end $$;

-- Counts ignore all test provenance; money is grouped by currency, never added across currencies.
create function public.crm_summary(p_organization_id uuid,p_brand_id uuid default null) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
select jsonb_build_object(
 'leads',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test),
 'new',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and stage='nuevo'),
 'hot',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and classification='HOT'),
 'warm',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and classification='WARM'),
 'cold',(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and classification='COLD'),
 'open',(select count(*) from public.crm_opportunities where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and outcome='open'),
 'follow_ups',(select count(*) from public.crm_activities where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and completed_at is null and due_at is not null)+(select count(*) from public.crm_leads where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and follow_up_at is not null and stage not in ('ganado','perdido')),
 'sent',(select count(*) from public.crm_proposals where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and status='sent'),
 'won',(select count(*) from public.crm_opportunities where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and outcome='won'),
 'won_value',coalesce((select jsonb_object_agg(currency,total) from (select currency,sum(closed_value) total from public.crm_opportunities where organization_id=p_organization_id and (p_brand_id is null or brand_id=p_brand_id) and not is_test and outcome='won' group by currency) x),'{}'::jsonb)
);
$$;
revoke all on function public.crm_create_lead(uuid,jsonb,uuid), public.crm_update_lead(uuid,uuid,jsonb),public.crm_summary(uuid,uuid) from public,anon;
grant execute on function public.crm_create_lead(uuid,jsonb,uuid), public.crm_update_lead(uuid,uuid,jsonb),public.crm_summary(uuid,uuid) to authenticated;

-- Inbound n8n writes: server credential only, pinned organization in the HTTP handler.
create function public.crm_ingest_lead(p_organization_id uuid,p_event jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare prior public.crm_inbound_events; lead uuid; contact uuid; brand uuid=(p_event->>'brand_id')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text||'n8n:'||(p_event->>'external_id'),0));
 select * into prior from public.crm_inbound_events where organization_id=p_organization_id and provider='n8n' and event_id=p_event->>'event_id';
 if prior.id is not null then
  if prior.payload_hash<>p_hash then raise exception 'Event id reused with different content' using errcode='23505'; end if;
  return jsonb_build_object('lead_id',prior.lead_id,'duplicate',true);
 end if;
 if not exists(select 1 from public.brands where organization_id=p_organization_id and id=brand) then raise exception 'Unknown authorized brand' using errcode='23503'; end if;
 select id into lead from public.crm_leads where organization_id=p_organization_id and brand_id=brand and source_system='n8n' and external_id=p_event->>'external_id';
 if lead is null then
  insert into public.crm_contacts(organization_id,brand_id,name,company,email,phone,channel,is_test)
  values(p_organization_id,brand,p_event->'contact'->>'name',coalesce(p_event->'contact'->>'company',''),coalesce(p_event->'contact'->>'email',''),coalesce(p_event->'contact'->>'phone',''),p_event->>'source',(p_event->>'is_test')::boolean) returning id into contact;
  insert into public.crm_leads(organization_id,brand_id,contact_id,source,service,need,score,classification,ai_problem,ai_opportunity,ai_recommendation,next_action,evaluated_at,captured_at,source_system,external_id)
  values(p_organization_id,brand,contact,p_event->>'source',coalesce(p_event->>'service',''),coalesce(p_event->>'need',''),(p_event->>'score')::integer,p_event->>'classification',coalesce(p_event->>'problem',''),coalesce(p_event->>'opportunity',''),coalesce(p_event->>'recommendation',''),coalesce(p_event->>'next_action',''),(p_event->>'evaluated_at')::timestamptz,(p_event->>'occurred_at')::timestamptz,'n8n',p_event->>'external_id') returning id into lead;
 end if;
 insert into public.crm_inbound_events(organization_id,provider,event_id,payload_hash,lead_id) values(p_organization_id,'n8n',p_event->>'event_id',p_hash,lead);
 return jsonb_build_object('lead_id',lead,'duplicate',false);
end $$;
revoke all on function public.crm_ingest_lead(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_ingest_lead(uuid,jsonb,text) to service_role;
commit;
