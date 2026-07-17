# ADR 001 — Supabase (cloud) au lieu de Postgres local via Docker

**Statut** : Validé

## Contexte

La première itération de l'architecture prévoyait Postgres en local via Docker Compose. Jugé trop lourd pour le poste de développement.

## Décision

- Hébergement Postgres + Auth + Storage sur **Supabase** (projet `BudgetPilot360`, ref `pokjpsmwkkmjhkvfwqpe`, région eu-west-2).
- Développement direct contre le projet cloud, pas d'instance locale (le CLI Supabase `supabase start` utilise Docker en interne — écarté pour la même raison).
- FastAPI reste le backend applicatif : logique métier, RBAC, workflow d'approbation, proxy Mistral. Il se connecte à Postgres via le connection pooler Supabase et/ou le client `supabase-py` avec la clé `service_role`.
- Le frontend utilise `supabase-js` avec la clé `anon` pour l'auth et les lectures simples protégées par RLS ; les écritures métier passent par FastAPI.
- La RLS Postgres portée nativement par Supabase remplace la RLS "manuelle" qu'on aurait dû configurer nous-mêmes — gain net.

## Conséquences

- Environnement de dev partagé (le projet cloud) — attention à ne pas polluer les données de test entre développeurs si l'équipe grandit (prévoir un projet Supabase distinct pour la prod le moment venu).
- Dépendance à la disponibilité réseau pour développer (pas de mode 100% offline).
- Simplifie fortement l'onboarding : plus de setup Docker/Postgres local, juste des clés API à copier dans `.env`.
