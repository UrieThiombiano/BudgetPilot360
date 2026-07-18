-- BudgetPilot360 — 011_registration_job_title.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 010.
--
-- Le rôle/fonction dans l'entreprise devient le libellé affiché PARTOUT à la
-- place de « Admin » / « Utilisateur » :
-- - le demandeur saisit son rôle (ex : Directeur Général) dès la demande de
--   compte → recopié dans profiles.job_title à l'approbation ;
-- - les collaborateurs invités ont déjà une fonction obligatoire (module team).

alter table public.registration_requests
  add column if not exists job_title text;

comment on column public.registration_requests.job_title is
  'Rôle du demandeur dans son entreprise (ex : Directeur Général) — devient profiles.job_title à l''approbation.';
