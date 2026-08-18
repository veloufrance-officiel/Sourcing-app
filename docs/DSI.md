# SourcingOS — Document technique (DSI / CTO / responsable sécurité)

État du dépôt documenté : `main @ 1e35085`. Chaque affirmation ci-dessous a été vérifiée directement contre le schéma réel de la base ou le code source au moment de la rédaction — pas de mémoire, pas de supposition. Là où une garantie est partielle ou absente, c'est nommé explicitement.

## 1. Architecture applicative

Next.js 16 (App Router) en frontal, Server Actions comme unique point d'écriture applicatif entre l'UI et Supabase — pas de couche API REST/GraphQL propre à ce projet à ce stade (Supabase expose sa propre API PostgREST en interne, mais l'application ne construit aucune API intermédiaire par-dessus). Supabase fournit Postgres, l'authentification (Auth), et Row Level Security comme mécanisme d'isolation principal.

```
Navigateur
    ↓
Next.js Server Action (session utilisateur, jamais service_role côté UI)
    ↓
Supabase (Postgres) — RLS appliqué sur chaque requête soumise à policy
    ↓
Triggers/contraintes DB — autorité finale sur certains invariants (détaillé section 4)
```

Rôle de chaque couche :
- **Next.js** : rendu, validation de forme des entrées, orchestration des appels Supabase. Ne porte aucune garantie de sécurité à lui seul — toute garantie réelle est vérifiée en base (RLS, contraintes, triggers), pas seulement dans le code applicatif.
- **Supabase Auth** : gestion de session, magic link + OAuth (Google/Apple configurés, non activés en production à ce jour).
- **Postgres (via Supabase)** : source de vérité, RLS, contraintes, triggers.

**Localisation des données** : hébergement principal Supabase, région AWS `eu-west-3` (Paris). La localisation du projet est européenne/française au niveau de l'infrastructure principale — les éventuels sous-traitants et flux associés restent soumis aux conditions et au DPA de Supabase. Point à traiter honnêtement plutôt qu'à dissimuler : ce projet dépend aujourd'hui de l'infrastructure Supabase, pas d'un hébergeur souverain dédié — une bascule vers un hébergement auto-géré a été envisagée en conception initiale mais n'est pas mise en œuvre à ce stade.

## 2. Isolation tenant

Stratégie : base partagée, `tenant_id` sur chaque table, RLS + contraintes composites en défense en profondeur.

**Tables avec RLS activé, vérifié exhaustivement (`pg_class.relrowsecurity`) — 15/15, sans exception :**
`activity_log`, `app_users`, `brief_criteria`, `candidate_contacts`, `candidates`, `clients`, `contact_oppositions`, `evidence`, `mission_candidates`, `missions`, `pipeline_stages`, `shortlist_candidates`, `shortlists`, `subscriptions`, `tenants`.

**Note honnête** : `relforcerowsecurity = false` sur toutes ces tables — le propriétaire de la base (`postgres`) est structurellement exempté de RLS. Ce n'est pas une faille : c'est le comportement Postgres standard, et les fonctions `SECURITY DEFINER` de ce projet en dépendent explicitement pour fonctionner (voir section 4). Aucun rôle applicatif (`authenticated`, `anon`) n'a ce privilège d'exemption.

**Défense en profondeur** : contraintes `UNIQUE (tenant_id, id)` sur les tables parentes + clés étrangères composites `(tenant_id, ref_id)` sur les relations traversant plusieurs tables (`missions.created_by`, `brief_criteria.mission_id`, `mission_candidates.*`, `shortlists.mission_id`, etc.). Une ligne référençant une entité d'un autre tenant est rejetée au niveau base.

## 3. RBAC

4 rôles réels (`app_users.role`, contrainte CHECK) : `owner`, `admin`, `recruiter`, `viewer`. Policies RLS différenciées par rôle sur les opérations d'écriture sensibles (Evidence, contact candidat, shortlist). `viewer` n'a aucun droit d'écriture sur ces tables — vérifié en conditions réelles pendant le développement (une tentative d'`UPDATE` par un `viewer` est silencieusement bloquée par RLS : 0 ligne affectée, aucune exception PostgREST levée — le code applicatif doit explicitement vérifier le nombre de lignes retournées, pas seulement l'absence d'erreur, pour détecter ce cas).

Règles dures appliquées par trigger, pas seulement par policy (`internal.prevent_self_role_or_tenant_change`, `internal.prevent_self_delete`) : personne ne peut modifier son propre rôle, changer son propre `tenant_id`, ou se supprimer soi-même.

## 4. Fonctions `SECURITY DEFINER` — liste exhaustive

Une fonction `SECURITY DEFINER` s'exécute avec les privilèges de son propriétaire (`postgres`), pas de l'appelant — c'est le comportement standard de PostgreSQL pour ce type de fonction, pas une omission de ce projet. Elle échappe donc à RLS par ce mécanisme, et chacune doit être auditée individuellement pour cette raison. Liste complète, vérifiée par requête sur `pg_proc.prosecdef` :

| Fonction | Schéma | Rôle |
|---|---|---|
| `current_tenant_id` | internal | Résout le tenant de l'utilisateur courant |
| `current_user_role` | internal | Résout le rôle de l'utilisateur courant |
| `enforce_contact_blocked_by_opposition` | internal | Trigger `BEFORE INSERT` sur `candidate_contacts` — bloque un contact si une opposition existe |
| `enforce_opposed_creates_contact_opposition` | internal | Trigger `AFTER INSERT OR UPDATE` — crée l'opposition durable quand `response='opposed'` |
| `notify_new_app_user` | internal | Notification Telegram à la création d'un utilisateur |
| `notify_telegram` | internal | Envoi générique de notification |
| `prevent_self_delete` | internal | Bloque l'auto-suppression d'un `app_users` |
| `prevent_self_role_or_tenant_change` | internal | Bloque l'auto-modification de rôle/tenant |
| `recalculate_eligibility` | internal | Recalcule `eligibility_status` sur changement d'Evidence/critère |
| `seed_default_pipeline_stages` | internal | Crée les statuts de pipeline par défaut à la création d'un tenant |
| `anonymize_candidate` | public | Anonymisation RGPD d'un candidat, appelable par owner/admin |
| `check_rate_limit` | public | Rate limiting générique (login, analyse IA) |
| `enforce_data_retention` | public | Purge/anonymisation des candidats au-delà de 2 ans, réservée à `service_role` |
| `enforce_opposition_retention` | public | Purge des oppositions expirées (3 ans), réservée à `service_role` |
| `get_shared_shortlist` | public | Accès public à une shortlist partagée via token |
| `get_tenant_anthropic_key_for_service`, `has_tenant_anthropic_key`, `remove_tenant_anthropic_key`, `set_tenant_anthropic_key` | public | Gestion de la clé Anthropic par tenant (BYOK), stockée chiffrée en Vault |

**Point de vigilance documenté explicitement** : deux triggers d'intégrité majeurs — `internal.enforce_human_verification` (garantit qu'une preuve `VERIFIED`/`CONTRADICTED` ne peut être posée que par une session humaine authentifiée) et `internal.enforce_shortlist_eligibility_gate` (bloque l'entrée en shortlist d'un candidat non éligible) — **ne sont pas** `SECURITY DEFINER`. Ils s'exécutent avec les privilèges de l'appelant réel, RLS s'applique normalement. C'est cohérent avec leur rôle (ils n'ont besoin d'aucun privilège élevé pour fonctionner), mais c'est une distinction réelle à connaître, vérifiée précisément avant d'écrire ce document plutôt que supposée uniforme avec les autres triggers.

Chaque fonction `SECURITY DEFINER` de ce projet pose `search_path = public` explicitement, prévenant une attaque par manipulation de `search_path`.

## 5. Distinction preuve / signal / inférence

Le cœur du modèle de qualification candidat. Table `evidence`, `status` contraint à 4 valeurs : `VERIFIED`, `NOT_VERIFIED`, `CONTRADICTED`, `INFERRED_UNCONFIRMED`.

**Garantie posée en base, pas en discipline applicative** : contrainte `evidence_inference_never_verified` — `CHECK (NOT (is_inference AND status = 'VERIFIED'))`. Un signal automatique (ex. un critère détecté via un dépôt GitHub public) ne peut structurellement jamais atteindre le statut `VERIFIED` sans passer par une confirmation humaine explicite, qui crée une ligne distincte.

`VERIFIED`/`CONTRADICTED` ne peuvent être posés que par une session `authenticated` réelle (`internal.enforce_human_verification`, trigger `BEFORE INSERT/UPDATE` sur `evidence`) — `service_role` en est explicitement exclu, vérifié en conditions réelles.

## 6. Éligibilité, score, shortlist — le garde-fou en trois étages

```
eligibility_status (recalculé automatiquement par trigger)
  INELIGIBLE     → une preuve CONTRADICTED sur un critère obligatoire
  NOT_QUALIFIED  → au moins un critère obligatoire sans preuve VERIFIED
  ELIGIBLE       → tous les critères obligatoires VERIFIED
        ↓
Score de matching — calculé côté application UNIQUEMENT si ELIGIBLE
(computeMatchScore n'est même pas appelé sinon, pas seulement masqué à l'affichage)
        ↓
shortlist_candidates — INSERT refusé par trigger BEFORE INSERT
(internal.enforce_shortlist_eligibility_gate) si eligibility_status != 'ELIGIBLE'
```

Vérifié en conditions réelles avant merge : un candidat aux compétences techniques déclarées parfaites, mais avec une seule preuve `CONTRADICTED` sur un critère obligatoire, reste `INELIGIBLE` et ne peut jamais entrer en shortlist, peu importe le contournement applicatif tenté.

## 7. Sourcing GitHub — provenance et minimisation

Recherche via l'API GitHub officielle (`api.github.com`), authentifiée par un token dédié (`GITHUB_SEARCH_TOKEN`, jamais exposé côté client). Aucun scraping, aucune source tierce.

Flux en deux temps, aucune écriture avant sélection explicite : `searchGithubCandidates` (lecture seule, filtre déjà les profils opposés avant affichage) → sélection humaine → `importGithubCandidates` (écriture, second contrôle d'opposition indépendant avant tout `INSERT`).

`candidates.github_user_id` (identifiant numérique GitHub stable, distinct du `login` qui est mutable) capturé et persisté — contrainte conditionnelle : obligatoire si `source='github'`, jamais requis sinon.

`candidates.email` n'est renseigné par **aucun** chemin de ce projet à ce jour — vérifié explicitement, 0/74 candidats en base (tous tenants confondus) ont ce champ renseigné, quelle que soit leur provenance.

## 8. Gestion des oppositions — liste repoussoir

Table `contact_oppositions`, structurellement indépendante de `candidates` (aucune clé étrangère vers cette table) — survit donc à la suppression ou l'anonymisation du candidat opérationnel, par construction, pas par discipline.

Clé : `(tenant_id, github_user_id)`, unicité contrainte. Scope tenant, pas global — une opposition enregistrée par un tenant ne bloque jamais un autre tenant sur le même profil GitHub public, vérifié en conditions réelles multi-tenant.

Minimisation : seules `tenant_id`, `github_user_id`, `opposed_at`, `recorded_by` sont conservées — aucune donnée candidat (nom, bio, localisation) n'est dupliquée dans cette table.

**Mécanisme de création automatique, pas une double écriture applicative espérée** : trigger `internal.enforce_opposed_creates_contact_opposition`, `AFTER INSERT OR UPDATE` sur `candidate_contacts`, se déclenche dès que `response = 'opposed'` existe — couvre nativement la création directe, la transition depuis un autre statut, et reste idempotent (`ON CONFLICT DO NOTHING`) sur un second déclenchement.

## 9. Fermeture d'une race condition (TOCTOU) — verrouillage explicite

Un défaut de conception a été identifié en revue avant merge, puis fermé, pas seulement documenté comme risque accepté : le contrôle applicatif d'opposition dans `markCandidateContacted` (un `SELECT` suivi d'un `INSERT`, deux appels HTTP PostgREST distincts) n'était pas atomique avec l'écriture réelle — reproduit et confirmé en conditions réelles avant correction.

**Correction** : les deux chemins qui touchent l'invariant opposition/contact acquièrent désormais le même verrou, dans le même ordre, avant toute décision :
- Chemin opposition (`internal.enforce_opposed_creates_contact_opposition`, modifié) : `SELECT ... FOR UPDATE` sur `candidates` avant de créer l'opposition
- Chemin contact (nouveau trigger `internal.enforce_contact_blocked_by_opposition`, `BEFORE INSERT` sur `candidate_contacts`) : même verrou, même ligne, avant d'autoriser l'`INSERT`

Le contrôle applicatif reste en place pour l'UX (retour immédiat d'une erreur métier dans le cas non concurrent), mais **la garantie de sécurité réelle vient exclusivement du trigger DB** — le client Supabase/PostgREST ne peut d'ailleurs pas exprimer `FOR UPDATE`, aucune ambiguïté possible sur ce point.

**Limite méthodologique assumée, pas cachée** : la propriété de sérialisation elle-même (une transaction concurrente demandant un verrou incompatible attend) est documentée par PostgreSQL — elle n'a pas été démontrée empiriquement avec deux connexions réellement simultanées dans ce projet, l'outillage de développement utilisé isolant chaque appel SQL dans sa propre connexion. Le fichier de test correspondant (`supabase/tests/serialize_contact_opposition_race.test.sql`) documente cette limite explicitement plutôt que de simuler une preuve non obtenue.

## 10. Rétention RGPD

Deux politiques distinctes, deux finalités distinctes :

| Table | Durée cible | Justification |
|---|---|---|
| `candidates` | jusqu'à 2 ans | Donnée de candidature active |
| `contact_oppositions` | au minimum 3 ans | Liste repoussoir — recommandation CNIL vérifiée sur source primaire (cnil.fr), spécifique à ce type de donnée, distincte de la durée de candidature |

Deux fonctions de purge distinctes (`enforce_data_retention`, `enforce_opposition_retention`), toutes deux réservées à `service_role`, appelées par un cron quotidien unique (`/api/cron/rgpd-retention`, `30 3 * * *`) avec isolation d'erreur explicite entre les deux — l'échec de l'une n'empêche jamais l'exécution de l'autre.

`anonymize_candidate` : jamais de `DELETE` brutal, les champs identifiants sont vidés, la ligne reste pour préserver l'intégrité référentielle du pipeline/shortlists/audit trail.

## 11. Ce qui est automatisé vs ce qui nécessite une validation humaine

| Automatisé | Nécessite une action humaine explicite |
|---|---|
| Extraction de critères depuis un brief (IA) | Confirmation `VERIFIED`/`CONTRADICTED` d'une preuve |
| Recalcul d'`eligibility_status` | Sélection des profils GitHub à importer (jamais automatique) |
| Calcul du score de matching (si éligible) | Rédaction/envoi du message de contact (SourcingOS génère un brouillon, ne l'envoie jamais) |
| Blocage DB d'un candidat non éligible en shortlist | Enregistrement de la réponse candidat |
| Création de l'opposition durable | — |
| Purge par rétention (cron) | — |

## 12. Tests et CI

105 tests Vitest au moment de la rédaction (Server Actions, composants) — chiffre évolutif, `npm run test` fait foi. 7 fichiers de tests SQL exécutés en CI contre une stack Supabase locale **fraîchement provisionnée** à chaque run (pas un environnement persistant) : isolation RLS/RBAC, moteur d'éligibilité, vérification humaine Evidence, shortlist gate, trigger d'opposition, rétention, sérialisation contact/opposition.

## 13. Limites de sécurité connues, non résolues à ce jour

- Aucune sauvegarde automatisée en place (item déjà identifié en audit interne, différé pour raison budgétaire)
- `contact_oppositions.recorded_by` documente l'auteur du contact initial, pas nécessairement celui qui a constaté la réponse — pas de colonne `responded_by` distincte sur `candidate_contacts`
- La concurrence réelle du verrou de sérialisation (section 9) n'a pas été prouvée empiriquement, seulement par propriété documentée du moteur
- Aucune certification ni conformité formelle (ISO, SOC2) n'est revendiquée — les garanties décrites dans ce document sont des faits vérifiés sur le schéma et le code, pas une attestation de conformité tierce
