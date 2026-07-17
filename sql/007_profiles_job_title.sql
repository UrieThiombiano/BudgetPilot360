-- BudgetPilot360 — 007_profiles_job_title.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 006.
-- Fonction (poste) facultative du collaborateur, renseignée par l'admin à
-- l'invitation. Aucune RLS supplémentaire : profiles est déjà couvert (001).

alter table public.profiles
  add column if not exists job_title text;
