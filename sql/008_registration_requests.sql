-- BudgetPilot360 — 008_registration_requests.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 007.
--
-- DÉCISION D'ARCHITECTURE FONDAMENTALE : les entreprises ne s'auto-inscrivent
-- plus. Elles déposent une DEMANDE (RegistrationRequest), entité totalement
-- distincte de companies. Le tenant n'est créé qu'après validation explicite
-- du super_admin Pukri :  RegistrationRequest → Validation → Company.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'registration_status') then
    create type public.registration_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

create table if not exists public.registration_requests (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  industry text not null,          -- secteur d'activité
  contact_name text not null,      -- nom du responsable
  email text not null,
  phone text not null,
  city text not null,
  employees_count int,             -- optionnel
  message text,                    -- optionnel
  status public.registration_status not null default 'pending',
  plan text,                       -- offre retenue à la validation (starter/standard/premium)
  subscription_months int,         -- durée de l'abonnement décidée à la validation
  internal_note text,              -- note interne Pukri, jamais exposée au demandeur
  rejection_reason text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  company_id uuid references public.companies(id), -- renseigné si approuvée
  created_at timestamptz not null default now()
);

create index if not exists registration_requests_status_idx
  on public.registration_requests (status, created_at desc);

-- RLS : réservé au super_admin. Le dépôt public d'une demande passe par le
-- backend (service_role) — aucun accès direct anon/authenticated à cette table.
alter table public.registration_requests enable row level security;

drop policy if exists registration_requests_super_admin on public.registration_requests;
create policy registration_requests_super_admin on public.registration_requests
  for all using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

-- Offre + échéance d'abonnement sur les entreprises (associées à la validation)
alter table public.companies
  add column if not exists plan text not null default 'starter';
alter table public.companies
  add column if not exists subscription_ends_at date;
