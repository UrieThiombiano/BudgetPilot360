-- BudgetPilot360 — 013_recurring_expenses.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 012.
--
-- Dépenses AUTOMATIQUES (licences, abonnements, loyers…) : l'admin définit
-- catégorie + montant + jour du mois + nombre de mois, et chaque échéance est
-- décomptée automatiquement (dépense créée directement APPROUVÉE, sans
-- validation), puis l'automatisation s'arrête d'elle-même.
--
-- Exécution : matérialisation « catch-up » côté FastAPI au premier accès
-- (dashboard/dépenses) — pas de cron : le backend Render (offre gratuite)
-- s'endort, un planificateur interne raterait des échéances. Idempotence
-- garantie par l'index unique (recurring_id, expense_date).

create table if not exists public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  category_id uuid not null references public.categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  description text not null,
  day_of_month int not null check (day_of_month between 1 and 31),
  months_total int not null check (months_total between 1 and 120),
  months_done int not null default 0,
  active boolean not null default true,
  next_due date not null,          -- prochaine échéance à matérialiser
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_expenses_due_idx
  on public.recurring_expenses (company_id, active, next_due);

-- RLS : lecture par les membres de l'entreprise, écriture admin uniquement
-- (les écritures passent par FastAPI en service_role — defense in depth).
alter table public.recurring_expenses enable row level security;

drop policy if exists recurring_expenses_select on public.recurring_expenses;
create policy recurring_expenses_select on public.recurring_expenses
  for select using (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  );

drop policy if exists recurring_expenses_admin_write on public.recurring_expenses;
create policy recurring_expenses_admin_write on public.recurring_expenses
  for all using (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  )
  with check (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );

-- Traçabilité : chaque dépense générée pointe son automatisation d'origine,
-- et une échéance donnée n'est JAMAIS décomptée deux fois (index unique).
alter table public.expenses
  add column if not exists recurring_id uuid references public.recurring_expenses(id) on delete set null;

create unique index if not exists expenses_recurring_once_per_due
  on public.expenses (recurring_id, expense_date)
  where recurring_id is not null;
