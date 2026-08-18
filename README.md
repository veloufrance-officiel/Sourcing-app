# OrakL — Sourcing OS

SaaS de sourcing freelance/tech, multi-tenant : un brief mission devient des critères structurés, les candidats sont qualifiés par des preuves vérifiables, un score n'est jamais calculé sans éligibilité confirmée, et une shortlist ne peut jamais contenir un candidat non éligible — au niveau base de données, pas seulement dans l'interface.

Conçu pour deux usages sur le même moteur : un usage interne (cabinet de recrutement, sourcing pour ses propres clients) et, à terme, un usage SaaS multi-cabinet, isolé tenant par tenant.

## Le problème que ça résout

Le sourcing recruteur repose largement sur des CV et des impressions. SourcingOS impose une discipline différente : chaque affirmation sur un candidat (« maîtrise TypeScript », « disponible en freelance ») est une ligne `evidence` avec un statut explicite — vérifiée humainement, jamais vérifiée, contredite, ou simple signal automatique non confirmé. Le score de matching ne se calcule **que** si le candidat est éligible sur tous les critères obligatoires. La shortlist n'accepte **que** les candidats éligibles — la contrainte est posée en base, un contournement applicatif ne suffit pas à la casser.

## Workflow actuellement implémenté

```
Brief mission (texte libre)
        ↓
Analyse IA (Claude) → critères structurés, pondérés
        ↓
Candidats ajoutés manuellement, OU découverts via recherche GitHub publique
        ↓
Preuves (Evidence) : vérifiées, non vérifiées, contredites, ou inférées
        ↓
Éligibilité recalculée automatiquement (trigger DB)
   ├── INELIGIBLE (preuve contredite sur un critère obligatoire)
   ├── NOT_QUALIFIED (au moins un critère obligatoire jamais prouvé)
   └── ELIGIBLE (tous les critères obligatoires vérifiés)
        ↓
Score de matching — calculé uniquement si ELIGIBLE
        ↓
Shortlist — insertion refusée en base si le candidat n'est pas ELIGIBLE
        ↓
[Pour un candidat GitHub] Contact tracé → réponse → si opposition, blocage durable
```

## Architecture générale

- **Next.js 16** (App Router), Server Actions comme unique point d'écriture depuis l'UI
- **Supabase** : Postgres + Auth + Row Level Security — RLS activé sur les 15 tables du schéma applicatif, sans exception
- **Multi-tenant** : `tenant_id` sur chaque table, policies RLS + contraintes composites `(tenant_id, id)` en défense en profondeur
- **RBAC réel** à 4 rôles (owner / admin / recruiter / viewer), appliqué par policy, pas seulement par l'UI

## Garanties importantes (vérifiées en base, pas seulement documentées)

- Un signal automatique (ex. profil GitHub) ne peut **jamais** devenir une preuve `VERIFIED` sans confirmation humaine — contrainte `evidence_inference_never_verified`
- Un score n'est calculé que pour un candidat `ELIGIBLE`
- Une insertion en shortlist pour un candidat non `ELIGIBLE` est rejetée par un trigger `BEFORE INSERT`, pas seulement par un contrôle applicatif
- Une opposition à être contacté (`contact_oppositions`) survit à la suppression du candidat et bloque toute redécouverte future du même profil, isolée par tenant
- Une course entre « contacter un candidat » et « enregistrer son opposition » est sérialisée par un verrou explicite (`SELECT ... FOR UPDATE`) sur la ligne `candidates`, pas laissée à un simple contrôle applicatif non atomique

Détail technique complet : [`docs/DSI.md`](./docs/DSI.md).
Présentation orientée métier : [`docs/CLIENT.md`](./docs/CLIENT.md).

## Stack technique

- Next.js 16, TypeScript strict, Tailwind v4
- Supabase (Postgres, Auth, RLS)
- Anthropic SDK (`claude-sonnet-5`) pour l'extraction de critères depuis un brief
- Vitest (tests unitaires/composants), tests SQL directs contre une stack Supabase locale en CI

## Lancer le projet en local

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Copier `.env.example` vers `.env.local`, renseigner les clés (Dashboard > Settings > API Keys — clés « publishable », pas les anciennes clés « anon »)
3. Appliquer les migrations : `supabase db push`
4. Créer une ligne `tenants` et une ligne `app_users` reliée à ton compte Supabase Auth
5. `npm install && npm run dev`

## Tests

```
npm run test        # suite Vitest — nombre de tests évolutif, vérifier avec la commande
npm run lint
npm run typecheck
npm run build
```

Les tests SQL (isolation RLS/RBAC, moteur d'éligibilité, vérification humaine, shortlist gate, opposition, rétention, sérialisation) tournent en CI contre une stack Supabase locale fraîchement provisionnée, pas seulement en local — voir `.github/workflows/ci.yml` et `supabase/tests/`.

## État actuel du projet

**Implémenté et testé :**
- Pipeline mission → brief IA → candidats → preuves → éligibilité → score → shortlist
- Sourcing GitHub public (recherche à la demande, sélection explicite avant import, jamais automatique)
- Mécanisme de contact candidat (génération de message, traçabilité, réponse, opposition)
- Rétention RGPD différenciée (candidats jusqu'à 2 ans ; liste d'opposition : au minimum 3 ans), cron quotidien
- RBAC, isolation multi-tenant, audit trail append-only

**Explicitement absent, pas une fonctionnalité cachée :**
- Aucun envoi d'email automatisé — le mécanisme de contact génère un message, le recruteur le copie et l'envoie lui-même depuis son propre canal
- Aucune facturation (Stripe) — structure de table posée (`subscriptions`), non activée
- Aucun signup self-serve — comptes provisionnés manuellement
- Sourcing limité à GitHub — pas de LinkedIn ni d'autre source
- Le multi-tenant n'a aujourd'hui qu'un seul tenant réel en production (`is_internal = true`) ; le SaaS multi-cabinet est architecturé mais pas commercialement activé

## Limites connues, documentées plutôt que dissimulées

- `candidates.email` n'est renseigné par aucun chemin actuel (ni saisie manuelle, ni import GitHub) — le mécanisme de contact ne peut donc jamais pré-remplir un destinataire
- `contact_oppositions.recorded_by` reflète l'auteur du contact initial, pas nécessairement celui qui a constaté la réponse — `candidate_contacts` n'a pas de colonne `responded_by` distincte
- Le scénario de concurrence réelle (deux transactions simultanées) sur le verrou de sérialisation contact/opposition est documenté et repose sur une propriété PostgreSQL établie, mais n'a pas été démontré empiriquement avec deux connexions réellement concurrentes — limite d'outillage, pas d'architecture
- Aucun automated backup n'est en place à ce stade (item déjà identifié en audit de sécurité, en attente budgétaire)
