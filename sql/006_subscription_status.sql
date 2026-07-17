-- BudgetPilot360 — 006_subscription_status.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 005.
-- Statut d'abonnement des entreprises clientes (espace Super Admin / Pukri).
-- Géré exclusivement par le backend (endpoints /platform, role super_admin) ;
-- la RLS existante sur companies suffit : les membres lisent leur entreprise
-- (donc son statut), seul l'admin/super_admin peut la modifier, et toute
-- écriture métier passe par FastAPI (service_role) de toute façon.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'subscription_status') then
    create type public.subscription_status as enum ('active', 'suspended');
  end if;
end$$;

alter table public.companies
  add column if not exists subscription_status public.subscription_status not null default 'active';
