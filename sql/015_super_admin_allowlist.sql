-- BudgetPilot360 — 015_super_admin_allowlist.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 001 à 014.
--
-- Contexte : le trigger handle_new_user (sql/003) assigne toujours le rôle
-- 'user' à l'inscription, y compris pour les comptes Pukri. Un super_admin ne
-- pouvait donc être promu qu'à la main dans le dashboard — geste manuel non
-- tracé (contraire à la règle CLAUDE.md "jamais de modif manuelle non tracée
-- dans le dashboard"), fragile, et c'est ce qui a cassé la connexion de
-- contact@pukri-ai.com.
--
-- Introduit une allowlist explicite et versionnée : tout email qui s'y trouve
-- est automatiquement créé en super_admin (sans entreprise) à l'inscription.

-- 1. Allowlist des comptes Pukri (super_admin). Table volontairement minimale :
--    ajouter un futur membre Pukri = une ligne insérée via SQL Editor, jamais
--    d'auto-inscription super_admin depuis le frontend public.
create table if not exists public.super_admin_allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.super_admin_allowlist enable row level security;

-- Lecture/écriture réservées à un super_admin déjà authentifié. Le tout
-- premier super_admin est nécessairement inséré à la main (voir plus bas),
-- le service_role (backend) bypass de toute façon la RLS.
drop policy if exists super_admin_allowlist_super_admin on public.super_admin_allowlist;
create policy super_admin_allowlist_super_admin on public.super_admin_allowlist
  for all using (public.current_role() = 'super_admin')
  with check (public.current_role() = 'super_admin');

insert into public.super_admin_allowlist (email)
values ('contact@pukri-ai.com')
on conflict (email) do nothing;

-- 2. Trigger de création de profil : rôle 'super_admin' si l'email est dans
--    l'allowlist au moment de l'inscription, sinon 'user' (comportement
--    inchangé pour tous les autres comptes).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  select case
    when exists (
      select 1 from public.super_admin_allowlist a
      where lower(a.email) = lower(new.email)
    ) then 'super_admin'::public.user_role
    else 'user'::public.user_role
  end into v_role;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    v_role
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. Corrige le compte contact@pukri-ai.com, déjà inscrit AVANT cette
--    migration : le trigger ne s'applique qu'aux nouvelles inscriptions, il
--    faut donc réaligner la ligne existante à la main, une seule fois.
update public.profiles
set role = 'super_admin', company_id = null
where lower(email) = 'contact@pukri-ai.com'
  and role <> 'super_admin';
