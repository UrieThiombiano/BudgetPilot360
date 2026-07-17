-- BudgetPilot360 — 002_budgets_categories_expenses.sql
-- À exécuter APRÈS 001_init_schema.sql

do $$
begin
  if not exists (select 1 from pg_type where typname = 'expense_status') then
    create type public.expense_status as enum ('pending', 'approved', 'rejected');
  end if;
end$$;

-- Catégories de dépenses (Transport, Carburant, Salaires, ...)
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  planned_budget numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

-- Dépenses
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null default current_date,
  description text,
  receipt_path text, -- chemin dans le bucket Supabase Storage "receipts", préfixé par company_id/
  status public.expense_status not null default 'pending',
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expenses_company_idx on public.expenses (company_id);
create index if not exists expenses_status_idx on public.expenses (company_id, status);

-- Commentaires sur une dépense
create table if not exists public.expense_comments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  content text not null,
  created_at timestamptz not null default now()
);

-- === RLS ===
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_comments enable row level security;

-- Catégories : isolation stricte par tenant, lecture/écriture pour tous les membres,
-- mais la logique "seul un admin peut créer/modifier" est appliquée côté FastAPI (RBAC applicatif),
-- la RLS ici garantit uniquement l'isolation entre entreprises.
drop policy if exists categories_tenant_isolation on public.categories;
create policy categories_tenant_isolation on public.categories
  for all using (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  )
  with check (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  );

-- Dépenses : isolation par tenant. Un "user" ne voit que ses propres dépenses,
-- un "admin" voit toutes les dépenses de son entreprise.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses
  for select using (
    public.current_role() = 'super_admin'
    or (company_id = public.current_company_id() and public.current_role() = 'admin')
    or (company_id = public.current_company_id() and user_id = auth.uid())
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses
  for insert with check (
    company_id = public.current_company_id() and user_id = auth.uid()
  );

-- Update : un user ne peut modifier que SA dépense tant qu'elle est "pending" ;
-- un admin peut la faire passer à approved/rejected. Le détail fin (empêcher un user
-- de modifier une dépense déjà validée) est aussi vérifié côté FastAPI.
drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses
  for update using (
    public.current_role() = 'super_admin'
    or (company_id = public.current_company_id() and public.current_role() = 'admin')
    or (company_id = public.current_company_id() and user_id = auth.uid() and status = 'pending')
  );

-- Commentaires : même logique d'isolation tenant
drop policy if exists expense_comments_tenant_isolation on public.expense_comments;
create policy expense_comments_tenant_isolation on public.expense_comments
  for all using (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  )
  with check (
    company_id = public.current_company_id() or public.current_role() = 'super_admin'
  );
