-- BudgetPilot360 — 003_onboarding_and_team.sql
-- À exécuter dans : Supabase Dashboard > SQL Editor, APRÈS 001 et 002.
-- Ajoute : email sur profiles, trigger de création auto du profil à l'inscription,
-- policy de lecture de son propre profil (avant onboarding), fonction atomique d'onboarding.

-- 1. Email dénormalisé sur profiles (source de vérité : auth.users, copié par trigger)
--    Nécessaire pour afficher l'équipe sans exposer auth.users au frontend.
alter table public.profiles add column if not exists email text;

-- Backfill pour les comptes créés avant ce trigger
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- 2. Trigger : à chaque inscription (insert dans auth.users), créer le profil.
--    company_id reste null → le frontend redirige vers l'écran "Créer mon entreprise".
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'user'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. RLS : un utilisateur doit pouvoir lire SON propre profil même sans company_id
--    (la policy profiles_select de 001 échoue quand company_id est null : null = null → false).
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select using (id = auth.uid());

-- 4. Onboarding atomique : crée la company + promeut l'utilisateur admin
--    dans UNE transaction (une fonction plpgsql = un bloc atomique).
--    Appelée uniquement par le backend FastAPI (service_role) via RPC.
create or replace function public.onboard_company(p_user_id uuid, p_company_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_existing uuid;
begin
  select company_id into v_existing
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_existing is not null then
    raise exception 'ALREADY_ONBOARDED';
  end if;

  insert into public.companies (name)
  values (trim(p_company_name))
  returning id into v_company_id;

  update public.profiles
  set company_id = v_company_id, role = 'admin'
  where id = p_user_id;

  return v_company_id;
end;
$$;

-- Réservée au backend (service_role bypass ces grants ; on ferme aux clients directs)
revoke execute on function public.onboard_company(uuid, text) from public, anon, authenticated;
