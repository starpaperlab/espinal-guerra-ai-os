-- Ejecutar únicamente en un proyecto de desarrollo autorizado.
-- La membresía se administra por un operador de confianza, nunca desde el navegador.
begin;
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  primary key (organization_id, user_id)
);
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  slug text not null,
  name text not null,
  unique (organization_id, slug)
);
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.brands enable row level security;
revoke all on public.organizations, public.organization_members, public.brands from anon, authenticated;
grant select on public.organizations, public.organization_members, public.brands to authenticated;
create policy "Read own memberships" on public.organization_members for select to authenticated using (user_id = (select auth.uid()));
create policy "Read member organizations" on public.organizations for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = organizations.id and m.user_id = (select auth.uid())));
create policy "Read member brands" on public.brands for select to authenticated using (exists (select 1 from public.organization_members m where m.organization_id = brands.organization_id and m.user_id = (select auth.uid())));
create index organization_members_user_idx on public.organization_members(user_id);
create index brands_organization_idx on public.brands(organization_id);
commit;
