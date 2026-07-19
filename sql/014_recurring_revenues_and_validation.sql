-- BudgetPilot360 — 014_recurring_revenues_and_validation.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 013.
--
-- 1) CHANGEMENT PRODUIT (backend, aucun DDL ici) : les dépenses automatiques
--    sont désormais générées au statut 'pending' et suivent le workflow de
--    validation standard (approbation admin) — plus jamais 'approved' d'office.
--    Le commentaire de 013 qui disait « sans validation » est caduc.
--
-- 2) RECETTES AUTOMATIQUES (« recettes attendues ») : même mécanisme que les
--    dépenses automatiques — l'admin (ou son adjoint) définit catégorie +
--    montant + jour du mois + nombre de mois ; chaque échéance crée une recette
--    directement confirmée (règle produit : les recettes sont comptées sans
--    validation). Visible et gérable par les admins uniquement ; les users
--    saisissent seulement leurs recettes.
--
-- NB : la table public.revenues a été créée directement dans le dashboard sans
-- migration versionnée — l'ALTER ci-dessous suppose qu'elle existe.

create table if not exists public.recurring_revenues (
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

create index if not exists recurring_revenues_due_idx
  on public.recurring_revenues (company_id, active, next_due);

-- RLS : lecture réservée aux ADMINS de l'entreprise (les recettes attendues ne
-- sont pas visibles des users — ils saisissent uniquement), écriture admin.
-- Les écritures passent par FastAPI en service_role — defense in depth.
alter table public.recurring_revenues enable row level security;

drop policy if exists recurring_revenues_select on public.recurring_revenues;
create policy recurring_revenues_select on public.recurring_revenues
  for select using (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );

drop policy if exists recurring_revenues_admin_write on public.recurring_revenues;
create policy recurring_revenues_admin_write on public.recurring_revenues
  for all using (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  )
  with check (
    (company_id = public.current_company_id() and public.current_role() = 'admin')
    or public.current_role() = 'super_admin'
  );

-- Traçabilité : chaque recette générée pointe son automatisation d'origine,
-- et une échéance donnée n'est JAMAIS comptée deux fois (index unique).
alter table public.revenues
  add column if not exists recurring_id uuid references public.recurring_revenues(id) on delete set null;

create unique index if not exists revenues_recurring_once_per_due
  on public.revenues (recurring_id, revenue_date)
  where recurring_id is not null;
