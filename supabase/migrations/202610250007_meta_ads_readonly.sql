-- Read-only Meta reporting. No campaign mutations, credentials or organization/brand inserts.
begin;
create table public.marketing_ad_accounts (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), brand_id uuid not null,
 meta_account_id text not null unique check(meta_account_id ~ '^act_[0-9]{5,30}$'), name text, currency text, timezone text,
 last_synced_at timestamptz, created_at timestamptz not null default now(), unique(organization_id,id),
 foreign key(organization_id,brand_id) references public.brands(organization_id,id)
);
create table public.marketing_meta_syncs (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, account_id uuid not null,
 requested_by uuid not null references auth.users(id), since date not null, until date not null,
 status text not null default 'running' check(status in ('running','success','error')),
 started_at timestamptz not null default now(), finished_at timestamptz, error_code text check(error_code in ('TOKEN_MISSING','TOKEN_EXPIRED','ACCESS_DENIED','RATE_LIMIT','NETWORK','META_UNAVAILABLE','INVALID_RESPONSE','TOO_MUCH_DATA','SAVE_FAILED')),
 permissions jsonb, summary jsonb, campaign_count integer check(campaign_count>=0),
 check(until>=since and until-since<=92), unique(organization_id,account_id,id),
 foreign key(organization_id,account_id) references public.marketing_ad_accounts(organization_id,id)
);
create index marketing_meta_sync_history on public.marketing_meta_syncs(account_id,started_at desc);
create table public.marketing_meta_campaign_metrics (
 organization_id uuid not null, account_id uuid not null, sync_id uuid not null,
 campaign_id text not null check(campaign_id ~ '^[0-9]+$'), campaign jsonb not null check(jsonb_typeof(campaign)='object'), insight jsonb check(insight is null or jsonb_typeof(insight)='object'),
 primary key(sync_id,campaign_id), foreign key(organization_id,account_id,sync_id) references public.marketing_meta_syncs(organization_id,account_id,id)
);
do $$ declare t text; begin
 foreach t in array array['marketing_ad_accounts','marketing_meta_syncs','marketing_meta_campaign_metrics'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy member_read on public.%I for select to authenticated using(exists(select 1 from public.organization_members m where m.organization_id=%I.organization_id and m.user_id=(select auth.uid())))',t,t);
 end loop;
end $$;
create function public.marketing_bind_meta_account(p_organization_id uuid,p_brand_id uuid,p_meta_account_id text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare result uuid; begin
 if not exists(select 1 from public.organization_members where organization_id=p_organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Administrator required' using errcode='42501'; end if;
 if not exists(select 1 from public.brands where organization_id=p_organization_id and id=p_brand_id) then raise exception 'Brand not authorized' using errcode='42501'; end if;
 select id into result from public.marketing_ad_accounts where meta_account_id=p_meta_account_id;
 if result is not null then
  if not exists(select 1 from public.marketing_ad_accounts where id=result and organization_id=p_organization_id and brand_id=p_brand_id) then raise exception 'Account already bound to another destination' using errcode='23514'; end if;
  return result;
 end if;
 insert into public.marketing_ad_accounts(organization_id,brand_id,meta_account_id) values(p_organization_id,p_brand_id,p_meta_account_id) returning id into result;
 return result;
end $$;
create function public.marketing_start_meta_sync(p_account_id uuid,p_since date,p_until date) returns uuid
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.marketing_ad_accounts; result uuid; begin
 select * into a from public.marketing_ad_accounts where id=p_account_id for update;
 if a.id is null or not exists(select 1 from public.organization_members where organization_id=a.organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_since is null or p_until is null or p_until<p_since or p_until-p_since>92 or p_until>current_date then raise exception 'Invalid date range' using errcode='23514'; end if;
 if exists(select 1 from public.marketing_meta_syncs where account_id=a.id and (started_at>now()-interval '60 seconds' or (status='running' and started_at>now()-interval '5 minutes'))) then raise exception 'Sync cooldown' using errcode='55P03'; end if;
 update public.marketing_meta_syncs set status='error',finished_at=now(),error_code='NETWORK' where account_id=a.id and status='running';
 insert into public.marketing_meta_syncs(organization_id,account_id,requested_by,since,until) values(a.organization_id,a.id,auth.uid(),p_since,p_until) returning id into result;
 return result;
end $$;
create function public.marketing_finish_meta_sync(p_sync_id uuid,p_snapshot jsonb default null,p_error_code text default null) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.marketing_meta_syncs; a public.marketing_ad_accounts; c jsonb; i jsonb; begin
 select * into s from public.marketing_meta_syncs where id=p_sync_id for update;
 if s.id is null or s.requested_by<>auth.uid() or not exists(select 1 from public.organization_members where organization_id=s.organization_id and user_id=auth.uid() and role in ('owner','admin')) then raise exception 'Administrator required' using errcode='42501'; end if;
 if s.status<>'running' then raise exception 'Sync already finished' using errcode='23514'; end if;
 if p_error_code is not null then
  update public.marketing_meta_syncs set status='error',finished_at=now(),error_code=p_error_code where id=s.id; return;
 end if;
 select * into a from public.marketing_ad_accounts where id=s.account_id;
 if p_snapshot is null or (p_snapshot->'account'->>'id') is distinct from a.meta_account_id or jsonb_typeof(p_snapshot->'campaigns') is distinct from 'array' or jsonb_typeof(p_snapshot->'insights') is distinct from 'array' or coalesce(p_snapshot->'account'->>'currency','') !~ '^[A-Z]{3}$' then raise exception 'Invalid snapshot' using errcode='23514'; end if;
 for i in select value from jsonb_array_elements(p_snapshot->'insights') loop
  if (i->>'date_start')::date<>s.since or (i->>'date_stop')::date<>s.until then raise exception 'Insight dates differ' using errcode='23514'; end if;
 end loop;
 for c in select value from jsonb_array_elements(p_snapshot->'campaigns') loop
  select value into i from jsonb_array_elements(p_snapshot->'insights') where value->>'campaign_id'=c->>'id';
  insert into public.marketing_meta_campaign_metrics(organization_id,account_id,sync_id,campaign_id,campaign,insight) values(s.organization_id,s.account_id,s.id,c->>'id',c,i);
 end loop;
 update public.marketing_ad_accounts set name=p_snapshot->'account'->>'name',currency=p_snapshot->'account'->>'currency',timezone=p_snapshot->'account'->>'timezone_name',last_synced_at=now() where id=a.id;
 update public.marketing_meta_syncs set status='success',finished_at=now(),permissions=p_snapshot->'permissions',summary=nullif(p_snapshot->'summary','null'::jsonb),campaign_count=jsonb_array_length(p_snapshot->'campaigns') where id=s.id;
end $$;
revoke all on function public.marketing_bind_meta_account(uuid,uuid,text),public.marketing_start_meta_sync(uuid,date,date),public.marketing_finish_meta_sync(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.marketing_bind_meta_account(uuid,uuid,text),public.marketing_start_meta_sync(uuid,date,date),public.marketing_finish_meta_sync(uuid,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
