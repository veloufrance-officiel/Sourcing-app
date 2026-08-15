# OrakL — Sourcing OS

Plateforme de sourcing freelance : missions, profils, pipeline, shortlists. Architecture complète dans [`orakl-architecture-v1.md`](./orakl-architecture-v1.md).

## Ce que contient le scaffold (Phase 1 — fondation)

- Next.js 16 (App Router, TypeScript strict, Tailwind v4)
- Auth Supabase (lien magique + Google/Apple), session rafraîchie par `src/proxy.ts`
- Migration DB complète : multi-tenant + RLS activé sur toutes les tables (`supabase/migrations/`)
- RBAC réel à 4 rôles (owner/admin/recruiter/viewer), testé (`supabase/tests/`)
- Missions, candidats, pipeline par statut, ajout au pipeline
- Analyse IA du brief (Claude, extraction de critères structurés — nécessite `ANTHROPIC_API_KEY`)
- Rate limiting sur la connexion, journal d'audit append-only
- CI : lint + typecheck + build sur chaque PR

**Volontairement absent pour l'instant** (Phases suivantes, voir la roadmap dans le doc d'architecture) : shortlists, facturation Stripe.

## Démarrer en local

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Copier `.env.example` vers `.env.local` et renseigner les clés (Dashboard > Settings > API Keys — utiliser les clés "publishable", pas les anciennes clés "anon" en cours de dépréciation)
3. Appliquer les migrations : `supabase db push` (ou coller le contenu de `supabase/migrations/*.sql`, dans l'ordre, dans le SQL Editor du dashboard)
4. Créer manuellement une ligne dans `tenants` (les statuts de pipeline se créent automatiquement via trigger) et une ligne dans `app_users` reliée à ton compte Supabase Auth
5. `npm install && npm run dev`

## Activer Google / Apple Sign-In

Le code est prêt (boutons + `/auth/callback`), mais chaque provider se configure hors du code, dans deux consoles externes puis dans Supabase :

1. **Google** : [Google Cloud Console](https://console.cloud.google.com) → créer un écran de consentement OAuth + un ID client OAuth 2.0 (type "Application Web"). URI de redirection autorisée : `https://<ton-projet>.supabase.co/auth/v1/callback`.
2. **Apple** : [Apple Developer](https://developer.apple.com/account) → Certificates, Identifiers & Profiles → créer un Services ID + une clé Sign in with Apple. Nécessite un compte Apple Developer payant (99 $/an).
3. Coller les identifiants de chaque provider dans **Supabase Dashboard > Authentication > Sign In / Providers**, et les activer.
4. Dans **Authentication > Settings**, désactiver "Allow new users to sign up" si tu veux garder le contrôle total sur qui peut se connecter (Google/Apple peuvent créer un compte auth sans passer par toi — mais sans ligne `app_users` correspondante, la personne ne verra aucune donnée, RLS oblige).

**Prêt pour le mobile ?** Oui. Supabase Auth n'est pas lié au web : une future app React Native/Expo utiliserait le même projet Supabase et les mêmes identifiants Google/Apple, avec `signInWithIdToken()` côté client (SDK natif Google/Apple → jeton → échange direct, sans navigateur). Rien de ce qui est posé ici n'est à refaire, seul le déclenchement côté client change.

## Décisions notables

- **Souveraineté du hosting** : décision prise de ne dépendre d'aucun opérateur sous juridiction américaine (CLOUD Act). Détail et hébergeurs retenus (Clever Cloud, VPS Supabase auto-hébergé chez OVHcloud) dans `orakl-architecture-v1.md`, section 7. Le code actuel pointe encore vers `*.supabase.co` en local/dev — seule l'URL change au moment de la bascule, pas le code.
- **Auth sans self-serve** : `shouldCreateUser: false` sur le lien magique. Seuls les comptes provisionnés manuellement (toi, Arnaud) peuvent se connecter par email. L'inscription libre est une décision de Phase 5, pas de maintenant.
- **Clé Supabase "publishable", jamais "secret"** dans le code applicatif : toute la sécurité tient sur les policies RLS de la migration. La clé secrète contournerait RLS — elle est dans `.env.example` mais non câblée, réservée aux futurs jobs serveur.
- **`proxy.ts` et non `middleware.ts`** : renommage Next.js 16, même rôle (rafraîchir la session, protéger les routes).
- **Pas de `tailwind.config.ts`** : Tailwind v4 utilise le theming CSS-first (`@theme` dans `globals.css`).
- **Polices auto-hébergées (`@fontsource`)** plutôt que `next/font/google` : pas de dépendance réseau externe au build.
