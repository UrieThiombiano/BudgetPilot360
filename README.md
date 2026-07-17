# BudgetPilot360 — Setup local (Windows 11, sans Docker)

## Prérequis à installer

| Outil | Version min | Vérifier avec |
|---|---|---|
| Git | dernière | `git --version` |
| Node.js | 20 LTS | `node --version` |
| Python | 3.11+ | `python --version` |
| Claude Code CLI | dernière | `claude --version` |

```powershell
npm install -g @anthropic-ai/claude-code
```

Pas de Docker, pas d'instance Postgres locale : on travaille directement contre le projet Supabase cloud **`BudgetPilot360`** (ref `pokjpsmwkkmjhkvfwqpe`, région eu-west-2).

## 1. Créer le dépôt

```powershell
mkdir budgetpilot360
cd budgetpilot360
git init
```

Copie-y le contenu de ce dossier (`backend/`, `frontend/`, `sql/`, `docs/`, `CLAUDE.md`, `README.md`, `.gitignore`).

## 2. Initialiser le schéma dans Supabase

1. Ouvre le dashboard Supabase → ton projet `BudgetPilot360` → **SQL Editor**.
2. Colle et exécute `sql/001_init_schema.sql`.
3. Colle et exécute `sql/002_budgets_categories_expenses.sql`.
4. Colle et exécute `sql/003_onboarding_and_team.sql` (trigger de création auto du profil à l'inscription, email dénormalisé, fonction atomique `onboard_company`).
5. Colle et exécute `sql/004_audit_logs.sql` (audit des actions sensibles, lecture admin uniquement).
6. Colle et exécute `sql/005_notifications.sql` (notifications applicatives, chacun ne lit que les siennes).
7. Crée le bucket Storage **`receipts`** (privé) : dashboard → **Storage → New bucket** → nom `receipts`, *Public bucket* décoché. Seul le backend (service_role) y accède ; le frontend passe par des URLs signées.
8. Récupère tes clés API : **Project Settings → API** → note `Project URL`, `anon public key`, `service_role key`, et `JWT Secret`.
9. Récupère ton connection string : **Project Settings → Database → Connection string → Connection pooling (Transaction mode)**.

## 3. Backend (FastAPI)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
```

Édite `backend/.env` avec les clés récupérées à l'étape 2.

```powershell
uvicorn app.main:app --reload
```
API sur `http://localhost:8000`, doc Swagger sur `http://localhost:8000/docs`.

## 4. Frontend (React + Vite)

```powershell
cd ..\frontend
npm install
copy .env.example .env
```

Édite `frontend/.env` avec `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (**jamais** la `service_role`).

```powershell
npm run dev
```
Frontend sur `http://localhost:5173`.

## 5. Créer ton premier utilisateur

Plus besoin de SQL manuel : le flux complet est dans l'application.

1. Ouvre `http://localhost:5173/signup` et crée ton compte (le trigger `on_auth_user_created` de `sql/003` crée le profil automatiquement).
2. À la connexion, l'app détecte que tu n'as pas d'entreprise et affiche l'écran **"Créer mon entreprise"** → tu deviens `admin`.
3. Depuis **Équipe** (menu latéral, admin uniquement), crée jusqu'à 3 utilisateurs (email + mot de passe temporaire).

> Si la confirmation d'email est activée dans Supabase (**Authentication → Providers → Email**), il faudra cliquer le lien reçu avant de se connecter. Désactive-la en dev pour aller plus vite.

## Endpoints backend disponibles (Phases 1 à 4)

| Méthode | Route | Rôle requis | Description |
|---|---|---|---|
| GET | `/health` | — | Sanity check |
| GET | `/profiles/me` | connecté | Profil courant (id, email, company_id, role) |
| POST | `/companies/onboard` | connecté sans entreprise | Crée la company + promeut admin (atomique) |
| GET | `/companies/me` | connecté | Entreprise courante (nom, budget annuel) |
| PATCH | `/companies/me` | admin | Modifie nom / budget annuel (audité) |
| GET | `/team/members` | admin | Membres + état de la limite (3 users max) |
| POST | `/team/members` | admin | Crée un utilisateur (API Admin Supabase, service_role) |
| GET | `/categories` | connecté | Catégories + consommé (dépenses approuvées) |
| POST | `/categories` | admin | Crée une catégorie (audité) |
| PATCH | `/categories/{id}` | admin | Modifie nom / budget prévu (audité) |
| DELETE | `/categories/{id}` | admin | Supprime (refus 409 si dépenses rattachées, audité) |
| POST | `/expenses` | connecté | Crée une dépense (statut `pending`) |
| GET | `/expenses/mine` | connecté | Mes dépenses avec statut |
| POST | `/expenses/{id}/receipt` | auteur | Joint un justificatif (PDF/PNG/JPEG/WebP, 10 Mo, bucket `receipts`) |
| GET | `/expenses/{id}/receipt` | auteur ou admin | URL signée du justificatif (10 min) |
| GET/POST | `/expenses/{id}/comments` | auteur ou admin | Commentaires de la dépense |
| GET | `/expenses/pending` | admin | Dépenses en attente de l'entreprise |
| POST | `/expenses/{id}/review` | admin | Approuve/rejette (motif obligatoire au rejet, atomique, audité, notifie l'auteur) |
| GET | `/notifications` | connecté | Ses notifications (récentes d'abord) |
| POST | `/notifications/mark-read` | connecté | Marque toutes ses notifications comme lues |

## Tests

```powershell
cd backend
.\venv\Scripts\Activate.ps1
python -m pytest tests/ -v     # unitaires, Supabase mocké — aucun réseau requis
```

```powershell
cd frontend
npm run build                  # typecheck TS + build production
```

## 6. Démarrer une session Claude Code

Depuis la racine du dépôt :
```powershell
claude
```
Claude Code charge automatiquement `CLAUDE.md`. Exemple de premier prompt :
> "Branche l'écran de login sur supabase.auth.signInWithPassword() et protège la route /dashboard."

## Notes

- Ne commite jamais `.env` (déjà exclu par `.gitignore`).
- `MISTRAL_API_KEY` n'est nécessaire que pour le module IA — pas bloquant au départ.
- Toute nouvelle table métier doit suivre le patron de `sql/002_...` : `company_id` + RLS. Voir `CLAUDE.md`.
