# Déploiement en production — BudgetPilot360

Architecture cible (Phase 12.2) :

```
Vercel (frontend React)  ──HTTPS──▶  Render (backend FastAPI, Docker)
        │                                     │
        └───────── supabase-js (auth) ────────┴──▶  Supabase PRODUCTION
                                                    (Postgres + RLS, Auth, Storage)
```

Trois environnements strictement séparés : le projet Supabase de dev
(`pokjpsmwkkmjhkvfwqpe`) ne sert **jamais** en production.

---

## 1. Projet Supabase de production

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New project** :
   nom `BudgetPilot360-prod`, région `eu-west-2` (Londres), mot de passe DB fort
   (à conserver dans un gestionnaire de secrets).
2. **SQL Editor** → rejouer les migrations **dans l'ordre**, une par une :
   `sql/001_init_schema.sql` → `002` → `003` → `004` → `005` → `006`.
   Chaque exécution doit se terminer par « Success ».
3. **Storage** → créer le bucket `receipts`, **privé** (Public bucket : OFF).
4. **Authentication → Sign In / Up** : garder la confirmation d'email activée.
   **Auth → URL Configuration** : Site URL = domaine Vercel de prod, et ajouter
   `https://<domaine-prod>/set-password` aux Redirect URLs (flux d'invitation
   des collaborateurs).
   ⚠️ **SMTP personnalisé obligatoire en prod** (Auth → Emails → SMTP Settings,
   ex. Brevo — gratuit 300/jour) : le SMTP intégré Supabase est limité à
   ~2 emails/heure ET impose les modèles anglais. Guide complet + modèles
   d'emails en français prêts à coller : `docs/EMAIL_TEMPLATES_FR.md`.
5. **Project Settings → API** : noter `Project URL`, `anon key`,
   `service_role key` (⚠️ backend uniquement).
6. Créer le compte super admin Pukri : inscrire l'utilisateur via l'app (ou
   Auth > Add user), puis dans SQL Editor :
   ```sql
   update public.profiles set role = 'super_admin'
   where id = (select id from auth.users where email = 'admin@pukri.fr');
   ```

## 2. Backend sur Render (Docker)

Le `Dockerfile` du dossier `backend/` embarque les bibliothèques Pango
nécessaires à WeasyPrint (PDF) — c'est la raison du choix Docker en prod.

1. Pousser le dépôt sur GitHub.
2. Render → **New → Blueprint** → sélectionner le dépôt : `render.yaml` est
   détecté et crée le service `budgetpilot360-api`.
3. Renseigner les variables marquées `sync: false` avec les valeurs du projet
   Supabase de **prod** (voir `backend/.env.production.example`).
   `FRONTEND_URL` = le domaine Vercel définitif (CORS restreint ; plusieurs
   origines possibles séparées par des virgules).
4. Vérifier après déploiement : `https://<service>.onrender.com/health`
   → `{"status":"ok","environment":"production"}`.

*Alternative Railway* : New Project → Deploy from GitHub repo, root directory
`backend`, Railway détecte le Dockerfile ; variables identiques.

## 3. Frontend sur Vercel

1. Vercel → **Add New → Project** → importer le dépôt.
   - **Root Directory : `frontend`** (monorepo).
   - Framework : Vite (build `npm run build`, output `dist` — détectés).
   - `frontend/vercel.json` gère le rewrite SPA (React Router).
2. **Environment Variables** (scope Production, voir
   `frontend/.env.production.example`) :
   - `VITE_SUPABASE_URL` — URL du projet Supabase de prod
   - `VITE_SUPABASE_ANON_KEY` — clé anon de prod (la seule côté client)
   - `VITE_API_URL` — URL du service Render
3. Déployer, puis reporter le domaine final dans `FRONTEND_URL` côté Render.

## 4. Checklist de mise en production

- [ ] Migrations 001 → 006 rejouées sans erreur sur le projet prod
- [ ] Bucket `receipts` créé et **privé**
- [ ] `service_role` uniquement dans Render — absente de Vercel et du code
- [ ] CORS : `FRONTEND_URL` = domaine(s) de prod exactement, pas de `*`
- [ ] `/health` répond `environment: production`
- [ ] Compte super_admin Pukri créé et promu
- [ ] Parcours complet testé en prod : signup → onboarding → catégorie →
      dépense + justificatif → approbation → notification + alerte de seuil →
      dashboard → export PDF/Excel → assistant IA
- [ ] Clés API dédiées à la prod (Mistral incluse), jamais partagées avec le dev

## 5. Ce qui reste hors périmètre 12.2 (assumé)

- CI/CD (GitHub Actions lançant pytest + vitest avant déploiement)
- Domaine personnalisé + emails transactionnels Supabase personnalisés
- Enforcement de la suspension d'abonnement (voir mémoire phase 10.1)
- Sauvegardes/PITR Supabase au-delà du plan par défaut
