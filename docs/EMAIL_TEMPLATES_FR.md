# Emails Supabase en français — BudgetPilot360

Supabase n'autorise la personnalisation des emails qu'avec un **SMTP
personnalisé** (le service intégré envoie les modèles anglais par défaut et
est limité à ~2 emails/heure — inutilisable en production de toute façon).

## Étape 1 — SMTP gratuit avec Brevo (~5 minutes)

Brevo (ex-Sendinblue) est recommandé : **300 emails/jour gratuits** et pas
besoin de posséder un nom de domaine — une adresse Gmail validée suffit
comme expéditeur.

1. Créez un compte sur [brevo.com](https://www.brevo.com) (gratuit).
2. Menu profil (en haut à droite) → **SMTP & API** → onglet **SMTP** →
   notez : serveur `smtp-relay.brevo.com`, port `587`, votre **login** et la
   **clé SMTP** (bouton « Générer une nouvelle clé SMTP »).
3. **Expéditeurs** (Senders & IP) → ajoutez l'adresse d'envoi (ex.
   `uriethiombiano853@gmail.com`) et validez-la via le code reçu.
4. Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom
   SMTP* :
   - Sender email : l'adresse validée chez Brevo
   - Sender name : `BudgetPilot360`
   - Host : `smtp-relay.brevo.com` · Port : `587`
   - Username : votre login Brevo · Password : la clé SMTP
   - Save. *(Pensez aussi à relever les limites : Authentication → Rate
     Limits → « Email sent » à 30/heure par exemple.)*

## Étape 2 — Coller les modèles français

Supabase → **Authentication → Emails → Templates** : pour chaque modèle,
remplacer le **Subject** et le **Body** (onglet Source) par ce qui suit.

---

### 1. Invite user (invitation collaborateur & ouverture de compte entreprise)

**Subject :** `Activez votre compte BudgetPilot360`

```html
<h2>Bienvenue sur BudgetPilot360 !</h2>
<p>Votre compte vient d'être créé sur <strong>BudgetPilot360</strong>, la plateforme de pilotage budgétaire de Pukri AI Systems.</p>
<p>Cliquez sur le bouton ci-dessous pour activer votre compte et choisir votre mot de passe — vous seul le connaîtrez :</p>
<p><a href="{{ .ConfirmationURL }}">Activer mon compte</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email.</p>
<p>— L'équipe Pukri AI Systems</p>
```

### 2. Magic link or OTP (connexion par email)

**Subject :** `Votre lien de connexion BudgetPilot360`

```html
<h2>Connexion à BudgetPilot360</h2>
<p>Cliquez sur le lien ci-dessous pour vous connecter à votre espace :</p>
<p><a href="{{ .ConfirmationURL }}">Me connecter</a></p>
<p>Ce lien est à usage unique et expire rapidement. Si vous n'avez pas demandé cette connexion, ignorez cet email.</p>
<p>— L'équipe Pukri AI Systems</p>
```

### 3. Reset password (mot de passe oublié)

**Subject :** `Réinitialisation de votre mot de passe BudgetPilot360`

```html
<h2>Réinitialisation de mot de passe</h2>
<p>Vous avez demandé la réinitialisation de votre mot de passe BudgetPilot360.</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email : votre mot de passe reste inchangé.</p>
<p>— L'équipe Pukri AI Systems</p>
```

### 4. Confirm sign up (confirmation d'adresse)

**Subject :** `Confirmez votre adresse email — BudgetPilot360`

```html
<h2>Confirmez votre adresse email</h2>
<p>Merci de confirmer votre adresse pour finaliser l'accès à BudgetPilot360 :</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon email</a></p>
<p>— L'équipe Pukri AI Systems</p>
```

### 5. Change email address (changement d'adresse)

**Subject :** `Confirmez votre nouvelle adresse email — BudgetPilot360`

```html
<h2>Changement d'adresse email</h2>
<p>Vous avez demandé à utiliser une nouvelle adresse email sur BudgetPilot360. Confirmez-la en cliquant ci-dessous :</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer ma nouvelle adresse</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, contactez votre administrateur.</p>
<p>— L'équipe Pukri AI Systems</p>
```

### 6. Reauthentication (code de vérification)

**Subject :** `Votre code de vérification BudgetPilot360`

```html
<h2>Code de vérification</h2>
<p>Voici votre code de vérification BudgetPilot360 :</p>
<p><strong style="font-size:24px">{{ .Token }}</strong></p>
<p>Saisissez-le dans l'application pour confirmer l'opération.</p>
<p>— L'équipe Pukri AI Systems</p>
```

---

> Les variables `{{ .ConfirmationURL }}` et `{{ .Token }}` sont remplacées
> automatiquement par Supabase — ne pas les modifier.
