# OrakL — Sourcing OS
### Architecture verrouillée — v1

## 1. Vision produit & séquencement

Deux usages partagent un seul moteur :

- **Usage interne** — toi + Arnaud Roncari. Pré-qualifier des freelances, les faire avancer dans un pipeline, les présenter en shortlist. Un seul tenant (le tien), rôle interne étendu.
- **Usage SaaS** — d'autres cabinets/recruteurs paient un abonnement mensuel pour utiliser le même outil sur leurs propres missions, isolés les uns des autres.

**Séquencement recommandé (le point le plus important) :** on architecture la base et les permissions *comme si* le multi-tenant existait déjà (coût quasi nul si c'est fait dès le départ). On ne construit **pas** tout de suite la couche commerciale SaaS (pricing, signup self-serve, Stripe, plans). Cette couche arrive après le premier placement réel avec Arnaud. Aujourd'hui sourcing OS a zéro client payant et zéro preuve d'usage réel — construire la facturation avant la preuve, c'est perdre des semaines sur la mauvaise priorité.

## 2. Modèle multi-tenant

Stratégie : **base de données partagée + `tenant_id` sur chaque table + Row Level Security Postgres**. Standard pour un SaaS B2B à ce stade (pas besoin d'isolation physique par client tant qu'il n'y a pas d'exigence contractuelle enterprise spécifique). Supabase gère ça nativement (Postgres + RLS + Auth).

Règle non négociable : **RLS activé sur toutes les tables dès la V1**, jamais "à ajouter plus tard". La fuite de données inter-clients est l'incident le plus coûteux pour un SaaS B2B, et c'est très difficile à greffer proprement sur une base qui a grandi sans ça.

Ton usage avec Arnaud = un tenant comme un autre (`is_internal = true`), pas un système parallèle codé séparément.

## 3. Modèle de données (v1)

D'après tes captures, la base existe déjà en substance : missions, profils, pipeline à 7 statuts (Nouveau, À vérifier, Contacté, Qualifié, Shortlist, Présenté, Placé), shortlists, journal d'activité, moteur d'analyse de brief. Le schéma complet est dans `schema-orakl-v1.sql`, avec notamment :

- `tenants`, `app_users` (rôle : owner / admin / recruiter / viewer)
- `missions` (avec `brief_raw` — texte source du brief client)
- `brief_criteria` — critères extraits par IA, liés à une mission
- `candidates` — avec champs RGPD (`consent_status`, `data_retention_until`)
- `pipeline_stages` — **configurable par tenant**, plus codé en dur
- `mission_candidates` — la vraie table de pipeline (candidat × mission × statut)
- `shortlists` / `shortlist_candidates`
- `activity_log` — déjà amorcé dans ton MVP, bon réflexe, à généraliser
- `subscriptions` — structure prête, activée en Phase 2

## 4. Rôles & permissions (RBAC réel, appliqué en base — v2)

Quatre rôles, appliqués par des policies RLS PostgreSQL différenciées (pas seulement dans l'UI) :

| Rôle | Missions/candidats/pipeline | Utilisateurs du tenant | Abonnement |
|---|---|---|---|
| `owner` | lecture + écriture | lecture + écriture (sauf soi-même) | lecture seule |
| `admin` | lecture + écriture | lecture + écriture (sauf soi-même) | lecture seule |
| `recruiter` | lecture + écriture | lecture seule | lecture seule |
| `viewer` | lecture seule | lecture seule | lecture seule |

Règles dures, appliquées par trigger PostgreSQL (pas par la seule policy RLS, donc valables même en cas de bug applicatif) :
- Personne ne peut modifier son propre `role` — même owner/admin sur sa propre ligne.
- Personne ne peut modifier `tenant_id` d'un `app_users` par cette voie.
- Personne ne peut se supprimer soi-même de `app_users`.

`subscriptions` : lecture seule pour tout le monde côté client, aucune policy d'écriture. Les changements viennent exclusivement d'un webhook Stripe côté serveur (clé secrète, hors RLS) — voir section 6.

`activity_log` : append-only. INSERT autorisé pour tout membre, SELECT pour tout membre, aucune policy UPDATE/DELETE — un utilisateur ne peut pas falsifier ou supprimer l'historique.

Question ouverte : Arnaud a-t-il besoin d'un compte dans l'outil (probablement `viewer` sur les shortlists présentées), ou reçoit-il des exports/liens ponctuels ?

## 4bis. Intégrité tenant_id (défense en profondeur)

Les policies RLS protègent contre les requêtes normales, mais ne protègent pas contre un bug applicatif ou un script `service_role` qui écrirait une ligne mélangeant deux tenants. Ajout de contraintes composites PostgreSQL (`unique(tenant_id, id)` sur les tables parentes + clés étrangères composites `(tenant_id, ref_id)`) sur toutes les relations traversant plusieurs tables : `missions.created_by`, `brief_criteria.mission_id`, `mission_candidates.*`, `shortlists.mission_id`, `shortlist_candidates.*`, `activity_log.actor_id`. Une ligne référençant une entité d'un autre tenant est rejetée au niveau base, pas seulement au niveau application.

Testé pour de vrai dans `supabase/tests/rls_rbac_isolation.test.sql` — 8 scénarios, tous vérifient un comportement réel (requêtes simulées "en tant que" différents rôles/tenants via `request.jwt.claim.sub`), pas la seule présence d'une policy.

## 5. Le moteur IA (analyse de brief)

C'est la vraie différenciation face à un ATS générique. À verrouiller :

- Modèle utilisé et prompt versionné (pas improvisé à chaque appel)
- Comportement si l'extraction échoue ou renvoie des critères vides (le log montre "0 nouveaux critères" — à vérifier si c'est un résultat normal ou un signe que l'extraction ne fonctionne pas encore)
- Coût par appel suivi (sur un plan gratuit/starter futur, un usage IA non plafonné mange la marge)

## 6. Facturation / MRR — Phase 2, pas Phase 1

Le moment venu : Stripe Billing, plans (Free / Starter / Pro), feature flags par plan (missions actives simultanées, quota d'analyses IA), webhook Stripe → mise à jour de `subscriptions`. La table existe déjà dans le schéma v1 : rien à migrer le jour J, juste à activer.

## 6bis. Modèle de commission (clarifié)

- **Mission `source = 'arnaud'`** (client final d'Arnaud) : les 10% de commission restent partagés Arnaud/toi, comme convenu au départ. Arnaud pré-qualifie déjà des freelances de son côté pour ces missions.
- **Mission `source = 'direct'`** (pas un client Arnaud) : les 10% sont pour toi seul.
- Déjà couvert par le schéma actuel : `missions.source` porte cette distinction, obligatoire à la création, sans défaut silencieux — donc traçable mission par mission, ce qui règle d'emblée toute ambiguïté avec Arnaud (tout est daté et logué dans `activity_log`).
- Le calcul et le suivi effectif de la commission (montant dû, historique) n'existent pas encore — prévu avec la Phase 2 (facturation), pas construit maintenant.

## 6quater. Roadmap P0 issue de l'audit Red Team du 16/08/2026

En attente de budget, priorité la plus haute dès que possible :
- **Passer Supabase Free → Pro (25$/mois)** — active les sauvegardes automatiques quotidiennes. Aujourd'hui : zéro backup, perte de données irréversible en cas d'incident. Pas urgent tant que l'usage reste interne/volume faible, mais **bloquant avant tout accès externe réel (Arnaud inclus)**.

Déjà fait suite au même audit :
- Rate limiting sur l'analyse IA du brief (1/30s par mission, 20/h par tenant, brief plafonné à 10 000 caractères) — protège contre une boucle d'appels coûteuse, cf. `check_rate_limit` réutilisé.

Rapport complet : `SOURCINGOS_RED_TEAM_AUDIT.md`.

## 6ter. Phase future — freelances premium (marketplace à deux faces)

Vision posée pour plus tard, volontairement pas construite maintenant : sur les missions `arnaud`, laisser les freelances déjà pré-qualifiés par Arnaud avoir une vraie chance d'être choisis — sans que ça devienne un passe-droit qui écrase un candidat objectivement mieux placé. Fonctionnalités envisagées, jusqu'à 3-4 paliers payants pour les freelances eux-mêmes :

- Mise en avant selon stack technique, localisation, disponibilité
- Visibilité anticipée sur une nouvelle mission (ex. 24h avant les autres) pour candidater en premier

**Contrainte non négociable, à respecter dès la conception de l'algorithme** : la pré-qualification (Arnaud ou premium payant) doit rester un signal de qualité parmi d'autres dans un scoring transparent, jamais un tri qui prime sur l'adéquation réelle au poste. Sans cette règle posée dès le départ, le système devient injuste pour les freelances non premium et perd toute crédibilité — à documenter précisément avant d'écrire une ligne de code de matching.

Prérequis techniques, aucun n'existe aujourd'hui :
1. Authentification freelance, séparée de celle des recruteurs (`app_users` ne couvre que les recruteurs/tenants)
2. Algorithme de scoring transparent et auditable (stack, localisation, disponibilité, qualité de pré-qualification) — le cœur du sujet, à concevoir avant tout code
3. Facturation freelance distincte de la facturation tenant (Stripe côté freelance, paliers propres)

Aujourd'hui, un `candidate` est une fiche gérée par le recruteur — personne ne s'y connecte. Ce chantier ne se code pas en une session ; il mérite sa propre conception avant implémentation.

## 6bis. Sauvegardes — action requise avant toute vraie donnée

Vérifié (pas supposé) : l'organisation Supabase est en plan **free**, qui n'offre **aucune sauvegarde automatique** — contrairement au plan Pro (7 jours de backups quotidiens, 25$/mois) ou Team (14 jours). Tant que la base ne contient que des données de test, ce n'est pas urgent. **Avant tout usage réel avec des candidats/missions réels (Arnaud inclus), passer sur un plan payant est un prérequis, pas une option** — sans ça, une mauvaise migration ou une suppression accidentelle est irréversible.

## 6ter. Rate limiting

Posé sur le point le plus exposé (demande de lien magique, accessible sans authentification) : 5 tentatives / 15 minutes par email, implémenté en PostgreSQL pur (table + fonction, pas de service externe type Upstash/Redis — cohérent avec "pas d'infrastructure inutile" tant que le volume ne le justifie pas). Fail-open assumé : une panne du rate limiter ne bloque jamais une connexion légitime, elle est juste loggée.

## 7. Stack technique recommandée — souveraineté

Décision : aucun opérateur sous juridiction américaine dans la chaîne (CLOUD Act), pas seulement des serveurs localisés en France. Un hébergeur français qui revend de l'AWS/Azure/GCP ne suffit pas — l'immunité extraterritoriale dépend de qui opère l'infrastructure, pas seulement d'où elle se trouve physiquement. C'est le critère que mesure SecNumCloud (qualification ANSSI, v3.2). Repère utile, pas une obligation à ce stade : SecNumCloud vise surtout OIV/administrations/secteurs régulés ; pour une PME, choisir un opérateur réellement français (capital, infrastructure propre, pas de revente de cloud américain) capte déjà l'essentiel de la protection.

- **Frontend** : Next.js sur **Clever Cloud** (Nantes, infrastructure propre, déploiement `git push`) plutôt que Vercel. OVHcloud et Scaleway sont des alternatives sérieuses.
- **Backend / DB / Auth** : stack **Supabase auto-hébergée** (Postgres + Auth + PostgREST + Storage, via Docker) sur un VPS souverain — OVHcloud propose une offre VPS Supabase dédiée. Le code applicatif ne change pas (mêmes clients `@supabase/ssr`, mêmes policies RLS) : seule l'URL du projet change, de `*.supabase.co` vers l'infrastructure auto-hébergée.
- **Compromis assumé** : l'auto-hébergement fait perdre les sauvegardes automatiques et les mises à jour en un clic de Supabase Cloud — ça devient une responsabilité opérationnelle interne (ou à déléguer). Pas bloquant aujourd'hui, à budgéter avant la mise en prod réelle.
- **IA** : appels LLM orchestrés côté serveur uniquement (inchangé).
- **Paiement** (Phase 2) : Stripe n'a pas d'équivalent souverain mature à ce jour — décision à reprendre le moment venu si la souveraineté doit s'étendre à la facturation.
- **Email transactionnel** : Resend/Postmark à réévaluer sous le même critère si besoin.

## 7bis. Cloisonnement des données

Déjà en place, pas un chantier à part : l'isolation *entre tenants* est assurée par le `tenant_id` + RLS sur chaque table (section 3), vérifiée avant tout déploiement (test : le tenant A ne voit jamais une ligne du tenant B). La question de la souveraineté ci-dessus porte sur *qui héberge* l'infrastructure, pas sur le cloisonnement logique des données, qui est un sujet distinct déjà résolu.

## 8. Sécurité & conformité — checklist prod-ready

- [ ] RLS activé et testé sur **toutes** les tables (test : le tenant A ne doit jamais voir une ligne du tenant B, même via un bug applicatif)
- [ ] Secrets en variables d'environnement, jamais en dur dans le code
- [ ] Rate limiting sur les endpoints IA (coût + abus)
- [ ] Sauvegardes DB automatiques + test de restauration
- [ ] RGPD : base légale pour stocker CV/coordonnées de candidats, durée de conservation, procédure de suppression sur demande
- [ ] Convention d'apporteur d'affaires signée avec Arnaud (déclencheur du 10%, durée, clause de non-contournement) — juridique, pas technique, mais fait partie du verrouillage global. Je ne suis pas juriste ; un avocat en droit commercial doit valider la formulation exacte.

## 9. Roadmap phasée

1. **Phase 0** — décision : reprendre le code Emergent exporté ou reconstruire proprement sur cette base
2. **Phase 1** — multi-tenant + RLS + rôles (ce document + `schema-orakl-v1.sql`)
3. **Phase 2** — pipeline configurable par tenant (sortir les 7 statuts du dur)
4. **Phase 3** — durcissement du moteur IA de brief + matching profils
5. **Phase 4** — premier usage réel avec Arnaud sur une vraie mission
6. **Phase 5** — Stripe + plans + onboarding self-serve (seulement après Phase 4 validée)
7. **Phase 6** — durcissement sécurité/RGPD final avant ouverture à des clients externes

## 10. Décisions à trancher

- Code Emergent exporté quelque part (GitHub, zip) ou reconstruction complète ?
- Arnaud : compte dans l'outil ou exports manuels pour démarrer ?
- Hiérarchie de nom retenue : OrakL (marque) / Sourcing OS (produit) — à confirmer si différent.
