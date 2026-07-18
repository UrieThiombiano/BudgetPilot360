-- BudgetPilot360 — 012_referral_source.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 011.
--
-- Canal d'acquisition : « Comment nous avez-vous connu ? » (facultatif) sur la
-- demande de compte. Donnée déclarative gratuite, agrégée dans l'espace Pukri
-- pour piloter le marketing (bouche-à-oreille, réseaux sociaux, recherche…).

alter table public.registration_requests
  add column if not exists referral_source text;

comment on column public.registration_requests.referral_source is
  'Canal par lequel le demandeur a connu BudgetPilot360 (facultatif).';
