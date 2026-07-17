-- BudgetPilot360 — 001_init_schema.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor
-- Crée les tenants, les profils (liés à auth.users), les rôles, et la RLS de base.

-- 1. Types
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('super_admin', 'admin', 'user');
  end if;
end$$;

-- 2. Companies (les tenants)
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  annual_budget numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Profiles : 1-1 avec auth.users, porte company_id + role
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  role public.user_role not null default 'user',
  full_name text,
  created_at timestamptz not null default now()
);

-- Un admin ne peut avoir qu'un seul compte admin actif par entreprise (contrainte applicative
-- à vérifier aussi côté FastAPI, pas uniquement en DB) :
create unique index if not exists one_admin_per_company
  on public.profiles (company_id)
  where role = 'admin';

-- 4. Fonctions helper (SECURITY DEFINER pour pouvoir être appelées depuis les policies RLS
-- sans provoquer de récursion infinie sur profiles)
create or replace function public.current_company_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_role()
returns public.user_role
language sql stable security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- 5. RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;

-- companies : visible par ses propres membres, ou par le super_admin (toutes)
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies
  for select using (
    id = public.current_company_id() or public.current_role() = 'super_admin'
  );

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies
  for update using (
    (id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );

-- profiles : visible par les membres de la même entreprise, ou par le super_admin
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert with check (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );
