-- BudgetPilot360 — 009_profiles_removed_at.sql
-- À exécuter APRÈS 001..008, dans Supabase Dashboard > SQL Editor.
--
-- « Retirer un utilisateur » = DÉSACTIVATION DOUCE, jamais une suppression dure :
-- le modèle interdit déjà (à dessein) de supprimer un profil ayant des dépenses
-- (expenses.user_id ... ON DELETE RESTRICT) — c'est l'imputabilité (CLAUDE.md).
-- On marque donc le profil comme retiré (removed_at) et on bannit le compte Auth
-- côté backend. L'historique de dépenses est CONSERVÉ ; le slot des 3 users se
-- libère (les requêtes de comptage/listing ignorent les profils retirés).
-- Réversible : remettre removed_at à NULL + lever le ban réactive l'utilisateur.

alter table public.profiles
  add column if not exists removed_at timestamptz;

comment on column public.profiles.removed_at is
  'Non NULL = utilisateur retiré (désactivé). Le compte Auth est banni en parallèle. '
  'Ignoré dans le comptage des 3 users et dans la liste d''équipe. Historique conservé.';

-- Accélère le listing/comptage des membres actifs d''une entreprise.
create index if not exists profiles_active_members_idx
  on public.profiles (company_id)
  where removed_at is null;
