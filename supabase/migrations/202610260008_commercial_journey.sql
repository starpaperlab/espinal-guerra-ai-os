begin;
create table if not exists public.crm_commercial_events(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,brand_id uuid not null,lead_id uuid not null,
 event_key text not null,kind text not null check(kind in ('consent.updated','page.viewed','checkout.started','diagnostic.completed','registration.completed','trial.started','trial.ended','subscription.cancelled','subscription.paid','email.accepted','email.failed')),
 occurred_at timestamptz not null,payload_hash text not null,data jsonb not null default '{}'::jsonb,attribution jsonb not null default '{}'::jsonb,is_test boolean not null,
 received_at timestamptz not null default now(),unique(organization_id,event_key),foreign key(organization_id,brand_id,lead_id) references public.crm_leads(organization_id,brand_id,id)
);
alter table public.crm_commercial_events drop constraint if exists crm_commercial_events_kind_check;
alter table public.crm_commercial_events add constraint crm_commercial_events_kind_check check(kind in ('consent.updated','page.viewed','checkout.started','diagnostic.completed','registration.completed','trial.started','trial.ended','subscription.cancelled','subscription.paid','email.accepted','email.failed'));
alter table public.crm_commercial_events enable row level security;
revoke all on public.crm_commercial_events from public,anon,authenticated;
grant all on public.crm_commercial_events to service_role;
grant select on public.crm_commercial_events to authenticated;
drop policy if exists commercial_read on public.crm_commercial_events;
create policy commercial_read on public.crm_commercial_events for select to authenticated using(exists(select 1 from public.organization_members where organization_id=crm_commercial_events.organization_id and user_id=auth.uid()));
create or replace function public.crm_ingest_commercial_source(p_source_key text,p_provider text,p_event jsonb,p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.crm_capture_sources;j jsonb=p_event->'journey';l public.crm_leads;c uuid; prior public.crm_commercial_events;ekey text;ext text;event_at timestamptz=(p_event->>'occurred_at')::timestamptz;test boolean=(p_event->>'is_test')::boolean;contact_email text=lower(trim(p_event->'contact'->>'email'));
begin
 select a.* into s from public.crm_capture_sources a join public.crm_enterprise_settings e on e.organization_id=a.organization_id where a.source_key=p_source_key and a.enabled and a.provider='signed_backend' and p_provider='signed_backend';
 if s.id is null or p_event->>'capture_source_key' is distinct from p_source_key or p_event->>'brand_id' is not null then raise exception 'Authorized source required' using errcode='23503';end if;
 if j->>'capture_id' is distinct from p_event->>'external_id' or contact_email is null or contact_email='' then raise exception 'Invalid capture identity' using errcode='23514';end if;
 ekey=s.id||':'||(p_event->>'event_id');ext=s.id||':'||(p_event->>'external_id');
 perform pg_advisory_xact_lock(hashtextextended(s.organization_id||':'||s.brand_id||':'||contact_email||':'||test,0));
 select * into prior from public.crm_commercial_events where organization_id=s.organization_id and event_key=ekey;
 if prior.id is not null then if prior.payload_hash<>p_hash then raise exception 'Event content conflict' using errcode='23505';end if;return jsonb_build_object('lead_id',prior.lead_id,'duplicate',true);end if;
 select * into l from public.crm_leads where organization_id=s.organization_id and brand_id=s.brand_id and source_system='signed_backend' and external_id=ext for update;
 if l.id is null then
  select id into c from public.crm_contacts where organization_id=s.organization_id and brand_id=s.brand_id and lower(crm_contacts.email)=contact_email and is_test=test order by created_at limit 1 for update;
  if c is null then insert into public.crm_contacts(organization_id,brand_id,name,email,channel,is_test) values(s.organization_id,s.brand_id,p_event->'contact'->>'name',contact_email,'ceo_diagnostico',test) returning id into c;else update public.crm_contacts set name=p_event->'contact'->>'name' where id=c and updated_at<=event_at and name is distinct from p_event->'contact'->>'name';end if;
  insert into public.crm_leads(organization_id,brand_id,contact_id,source,campaign,service,captured_at,source_system,external_id,capture_metadata) values(s.organization_id,s.brand_id,c,'ceo_diagnostico',coalesce(j->'attribution'->>'utm_campaign',''),'Diagnóstico CEO Rentable',(case when j->>'kind'='diagnostic.completed' then event_at else now() end),'signed_backend',ext,jsonb_build_object('form',j->>'form','capture_id',j->>'capture_id','attribution',j->'attribution','diagnostic',j->'diagnostic','answers',j->'answers','promotional_consent',j->'promotional_consent')) returning * into l;
 elsif l.is_test<>test then raise exception 'Test provenance mismatch' using errcode='23514';end if;
 if j->>'kind'='diagnostic.completed' then update public.crm_leads set captured_at=event_at,capture_metadata=capture_metadata||jsonb_build_object('diagnostic',j->'diagnostic','answers',j->'answers','attribution',j->'attribution') where id=l.id;end if;
 insert into public.crm_commercial_events(organization_id,brand_id,lead_id,event_key,kind,occurred_at,payload_hash,data,attribution,is_test) values(s.organization_id,s.brand_id,l.id,ekey,j->>'kind',event_at,p_hash,coalesce(j->'data','{}'),j->'attribution',test);
 insert into public.crm_inbound_events(organization_id,provider,event_id,payload_hash,lead_id) values(s.organization_id,'signed_backend',ekey,p_hash,l.id);
 if j->>'kind'='consent.updated' and coalesce((l.capture_metadata->>'consent_updated_at')::timestamptz,'-infinity')<=event_at then update public.crm_leads set capture_metadata=capture_metadata||jsonb_build_object('promotional_consent',false,'consent_updated_at',event_at) where id=l.id;end if;
 if j->>'kind'='trial.started' then
  if j->'data'->>'subscription_id' is null or (j->'data'->>'ends_at')::timestamptz<=event_at then raise exception 'Verified trial period required' using errcode='23514';end if;
  insert into public.crm_conversions(organization_id,brand_id,lead_id,conversion_key,kind,is_test,occurred_at) values(s.organization_id,s.brand_id,l.id,ekey,'trial_started',test,event_at) on conflict do nothing;
  update public.crm_leads set stage='interesado' where id=l.id and stage not in ('ganado','perdido');
 elsif j->>'kind'='subscription.paid' then
  if coalesce(j->'data'->>'payment_id','')='' or coalesce(j->'data'->>'provider','') not in ('paypal','stripe') or coalesce((j->'data'->>'amount')::numeric,0)<=0 or coalesce(j->'data'->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Confirmed payment required' using errcode='23514';end if;
  insert into public.crm_conversions(organization_id,brand_id,lead_id,conversion_key,kind,amount,currency,is_test,occurred_at) values(s.organization_id,s.brand_id,l.id,s.id||':'||(j->'data'->>'provider')||':'||(j->'data'->>'payment_id'),'subscription',(j->'data'->>'amount')::numeric,j->'data'->>'currency',test,event_at) on conflict do nothing;
  update public.crm_leads set stage='ganado' where id=l.id;
 end if;
 return jsonb_build_object('lead_id',l.id,'duplicate',false);
end$$;
revoke all on function public.crm_ingest_commercial_source(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.crm_ingest_commercial_source(text,text,jsonb,text) to service_role;
create or replace function public.crm_commercial_report(p_org uuid,p_brand uuid default null) returns jsonb language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare result jsonb;begin
 if not exists(select 1 from public.organization_members where organization_id=p_org and user_id=auth.uid()) then raise exception 'Member required' using errcode='42501';end if;
 select jsonb_build_object(
 'leads',(select count(distinct contact_id) from public.crm_leads where organization_id=p_org and (p_brand is null or brand_id=p_brand) and not is_test and capture_metadata?'diagnostic'),
 'diagnostics',count(distinct lead_id) filter(where kind='diagnostic.completed'),
 'emails_accepted',count(*) filter(where kind='email.accepted'),
 'trials_started',count(distinct data->>'subscription_id') filter(where kind='trial.started'),
 'trials_active',(select count(*) from public.crm_commercial_events t where t.organization_id=p_org and (p_brand is null or t.brand_id=p_brand) and not t.is_test and t.kind='trial.started' and (t.data->>'ends_at')::timestamptz>now() and not exists(select 1 from public.crm_commercial_events x where x.lead_id=t.lead_id and x.kind in ('subscription.paid','subscription.cancelled','trial.ended') and x.occurred_at>=t.occurred_at)),
 'trials_finished',(select count(*) from public.crm_commercial_events t where t.organization_id=p_org and (p_brand is null or t.brand_id=p_brand) and not t.is_test and t.kind='trial.started' and (t.data->>'ends_at')::timestamptz<=now()),
 'paid_customers',(select count(distinct l.contact_id) from public.crm_leads l join public.crm_commercial_events e on e.lead_id=l.id where e.organization_id=p_org and (p_brand is null or e.brand_id=p_brand) and not e.is_test and e.kind='subscription.paid'),
 'paid_subscriptions',count(distinct data->>'subscription_id') filter(where kind='subscription.paid'),
 'revenue',(select coalesce(jsonb_agg(v),'[]') from(select currency,sum(amount) amount from public.crm_conversions where organization_id=p_org and (p_brand is null or brand_id=p_brand) and not is_test and kind='subscription' group by currency)v),
 'campaigns',(select coalesce(jsonb_agg(v),'[]') from(select coalesce(nullif(attribution->>'utm_campaign',''),'Sin campaña documentada') campaign,count(distinct lead_id) filter(where kind='diagnostic.completed') diagnostics,count(distinct lead_id) filter(where kind='trial.started') trials,count(distinct lead_id) filter(where kind='subscription.paid') paid from public.crm_commercial_events where organization_id=p_org and (p_brand is null or brand_id=p_brand) and not is_test group by attribution->>'utm_campaign')v)
 ) into result from public.crm_commercial_events where organization_id=p_org and (p_brand is null or brand_id=p_brand) and not is_test;
 return result;
end$$;
revoke all on function public.crm_commercial_report(uuid,uuid) from public,anon;
grant execute on function public.crm_commercial_report(uuid,uuid) to authenticated;
notify pgrst,'reload schema';commit;
