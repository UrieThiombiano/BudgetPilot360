-- BudgetPilot360 — 010_admin_adjoint.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor (après 009).
--
-- Admin adjoint (co-fondateurs) : l'administrateur PRINCIPAL d'une entreprise
-- peut nommer UN de ses utilisateurs admin adjoint.
-- 1. `companies.owner_id` identifie l'administrateur principal (propriétaire).
--    Backfill : l'admin actif actuel de chaque entreprise devient propriétaire.
-- 2. L'index unique `one_admin_per_company` saute : il bloquait physiquement
--    tout second admin. La règle devient « 1 principal + 1 adjoint max »,
--    vérifiée côté FastAPI (team/service.set_member_role) — comme la limite
--    des 3 collaborateurs.

-- 1. Propriétaire de l'entreprise
alter table public.companies
  add column if not exists owner_id uuid references public.profiles(id);

comment on column public.companies.owner_id is
  'Administrateur principal (propriétaire) — seul habilité à nommer/révoquer un admin adjoint.';

-- Backfill : l'admin actif de chaque entreprise devient le propriétaire.
update public.companies c
set owner_id = p.id
from public.profiles p
where p.company_id = c.id
  and p.role = 'admin'
  and p.removed_at is null
  and c.owner_id is null;

-- 2. Autoriser un second admin (l'adjoint) — la limite « 1 adjoint max »
--    est vérifiée côté backend, pas en DB.
drop index if exists public.one_admin_per_company;
