# BudgetPilot360 — Contexte projet pour Claude Code

> Ce fichier est lu automatiquement par Claude Code au démarrage de chaque session dans ce dépôt. Il fait foi pour toutes les décisions d'architecture déjà validées.

## Rôle attendu

Tu es le CTO virtuel de ce projet. Avant toute fonctionnalité non triviale : analyser le besoin, proposer les options avec avantages/inconvénients, recommander une solution, attendre validation si la décision est structurante. Ne jamais dupliquer du code. Toujours penser évolutivité.

## Produit

**BudgetPilot360** — plateforme SaaS de pilotage budgétaire pour PME (pas un logiciel de comptabilité), éditée par **Pukri AI Systems**.

## Rôles & permissions

| Rôle | Portée | Peut faire |
|---|---|---|
| **super_admin** (Pukri) | Toute la plateforme | Gérer entreprises clientes, abonnements/licences, stats globales |
| **admin** | 1 principal (`companies.owner_id`) + 1 adjoint max par entreprise | Config entreprise, budget annuel, catégories, budgets par catégorie, inviter des collaborateurs, approuver/rejeter dépenses, dashboards, export, IA. Seul le PRINCIPAL nomme/révoque l'adjoint (co-fondateurs, sql/010). L'adjoint garde son siège dans la limite des 3. |
| **user** | Max 3 collaborateurs par entreprise (adjoint compris) | Créer une dépense/recette, joindre facture, commenter, voir ses propres dépenses uniquement. Sa « Fonction » (obligatoire à l'invitation) sert de libellé de rôle. |

## Workflow métier central

```
Utilisateur crée une dépense → statut "pending" → notification Admin
→ Admin approuve ou rejette
→ si approuvée : budget mis à jour + dashboards recalculés + notification utilisateur
```

## Décisions d'architecture VALIDÉES

### Infrastructure : Supabase (hébergé), pas de Docker

- Projet Supabase existant : **`BudgetPilot360`**, project ref `pokjpsmwkkmjhkvfwqpe`, région **eu-west-2 (Londres)**.
- On développe directement contre le projet cloud Supabase — pas d'instance locale, pas de `supabase start` (qui utilise Docker en interne), pas de docker-compose.
- Supabase fournit : Postgres managé, Auth (JWT), Storage (pièces justificatives), Realtime (utilisable plus tard pour les notifications live).

### Multi-tenant : `company_id` + Row Level Security (RLS) native Supabase

- Table `public.companies` = les tenants.
- Table `public.profiles` (1-1 avec `auth.users`) porte `company_id` + `role` (enum `user_role`: `super_admin` / `admin` / `user`).
- Deux fonctions SQL helper : `public.current_company_id()` et `public.current_role()`, basées sur `auth.uid()`.
- **Toute table métier a une colonne `company_id` non nullable + RLS activé** avec policy `company_id = public.current_company_id()`.
- Le `super_admin` bypass la RLS via ces mêmes fonctions (policy `OR public.current_role() = 'super_admin'`).
- Voir `sql/001_init_schema.sql` et `sql/002_budgets_categories_expenses.sql` — à exécuter dans l'éditeur SQL du dashboard Supabase, dans l'ordre.
- **Toute nouvelle table métier DOIT avoir `company_id` + policy RLS dès sa création.** Non négociable — un oubli est une faille de sécurité critique (fuite de données entre entreprises clientes).

### Auth : Supabase Auth (pas de JWT/hash maison)

- Inscription/connexion gérées par Supabase Auth (email/password pour la v1).
- FastAPI vérifie les JWT émis par Supabase (JWKS / secret partagé) sur chaque endpoint protégé, extrait `sub` (user id) et va chercher `company_id` / `role` dans `profiles`.
- Le frontend utilise `supabase-js` pour l'auth et les lectures simples protégées par RLS.
- Les écritures qui touchent au workflow métier (créer une dépense, approuver, modifier un budget) passent **par FastAPI**, jamais en écriture directe frontend → Supabase, pour garder la logique métier centralisée et auditée.

### Dépôt : Monorepo

```
budgetpilot360/
├── backend/          # FastAPI (logique métier, endpoints, proxy IA)
├── frontend/         # React + Vite + TS (UI, auth via supabase-js)
├── sql/               # Migrations SQL à exécuter dans Supabase (schéma + RLS)
├── docs/adr/          # Décisions d'architecture
└── CLAUDE.md
```

## Stack technique

**Backend** : FastAPI, SQLAlchemy 2.x async (connexion directe au Postgres Supabase via le connection string du pooler), Pydantic v2, `PyJWT` pour valider les tokens Supabase, `supabase-py` pour les opérations privilégiées (service role) type Storage.

**Frontend** : React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, React Router, TanStack Query, Recharts, `@supabase/supabase-js`. Mode clair/sombre.

**IA** : Mistral uniquement. Flux : requête utilisateur → FastAPI construit le contexte via requêtes SQL scoping sur `company_id` → prompt Mistral → réponse. L'IA ne reçoit jamais un accès direct à la DB, jamais de clé API côté frontend.

**Stockage fichiers** : Supabase Storage, bucket `receipts`, avec policy RLS basée sur `company_id` (chemin de fichier préfixé par `company_id/`).

**Rapports** : export PDF (WeasyPrint) et Excel (openpyxl), générés côté FastAPI.

## Sécurité — non négociable

- RBAC vérifié côté backend à chaque endpoint (jamais uniquement côté frontend).
- RLS Postgres comme deuxième couche d'isolation (defense in depth), en plus du filtrage applicatif.
- Clé `service_role` Supabase **uniquement côté backend**, jamais exposée au frontend (seule la clé `anon` va côté client).
- Audit log sur les actions sensibles : approbation/rejet de dépense, modification de budget, gestion des utilisateurs, connexion.

## Conventions de code

- Code modulaire par domaine (`app/modules/<domaine>`), documenté, testable.
- Migrations SQL versionnées dans `sql/`, jamais de modif manuelle non tracée dans le dashboard.
- Pas de duplication — factoriser dans `app/core`.

## Roadmap (contexte, pas à implémenter maintenant)

recettes, trésorerie, prévisions budgétaires, facturation, rapprochement bancaire, IA prédictive, apps mobiles.

## Prochaine étape actuelle

1. Créer le projet Supabase (déjà fait — `pokjpsmwkkmjhkvfwqpe`).
2. Exécuter `sql/001_init_schema.sql` puis `sql/002_budgets_categories_expenses.sql` dans l'éditeur SQL Supabase.
3. Renseigner `.env` (backend et frontend) avec les clés du dashboard Supabase (Project Settings → API).
4. Lancer le backend et le frontend en local (voir `README.md`), brancher l'écran de login sur Supabase Auth.
