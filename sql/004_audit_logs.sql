-- BudgetPilot360 — 004_audit_logs.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 003.
-- Audit log des actions sensibles (CLAUDE.md, non négociable) : modification de
-- budget, gestion des catégories, gestion des utilisateurs, approbations (Phase 3).
-- Écrit UNIQUEMENT par le backend (service_role) — aucune policy d'insert client.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,            -- ex : 'company.budget_updated', 'category.created'
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_company_idx
  on public.audit_logs (company_id, created_at desc);

alter table public.audit_logs enable row level security;

-- Lecture : admin de l'entreprise ou super_admin. Pas d'insert/update/delete côté
-- client : seul le backend (service_role, bypass RLS) écrit, et rien ne s'efface.
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs
  for select using (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );
