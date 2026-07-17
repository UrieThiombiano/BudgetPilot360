-- BudgetPilot360 — 005_notifications.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 004.
-- Notifications applicatives (résultat d'approbation/rejet de dépense, etc.).
-- Écrites par le backend (service_role). Le destinataire lit et marque comme lu.
-- Realtime Supabase pourra s'abonner à cette table plus tard (roadmap).

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade, -- destinataire
  type text not null,              -- ex : 'expense_approved', 'expense_rejected'
  title text not null,
  body text,
  expense_id uuid references public.expenses(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Chacun ne voit que SES notifications (l'isolation company est implicite :
-- user_id appartient à une seule entreprise).
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

-- Marquer comme lu : uniquement ses propres notifications.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid());
