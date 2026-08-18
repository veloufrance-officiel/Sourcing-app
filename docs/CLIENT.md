# SourcingOS — présentation

**Pour qui** : cabinets de recrutement tech/freelance et recruteurs indépendants qui sourcent des profils techniques pour leurs clients.

## Le problème

Sourcer des freelances techniques prend du temps, et le résultat dépend souvent de ce qu'un CV *déclare*, pas de ce qui est réellement vérifié. Deux recruteurs qui reçoivent le même brief produisent rarement la même shortlist, et il est difficile de justifier après coup pourquoi un profil a été retenu plutôt qu'un autre.

SourcingOS structure ce processus : chaque candidat retenu porte des preuves vérifiables, pas seulement un score.

**Ce qui différencie l'approche** : la plupart des outils de sourcing trient des CV par mots-clés. SourcingOS distingue structurellement ce qui est *prouvé* de ce qui est *déclaré* — un signal automatique (un profil GitHub qui semble correspondre) ne devient jamais une compétence validée sans votre confirmation explicite. Un candidat au profil impressionnant mais avec un critère obligatoire contredit ne peut techniquement pas passer en shortlist, même par erreur.

## Comment ça fonctionne, du brief à la shortlist

**1. Le brief devient des critères.** Vous collez le texte de votre mission (ce que vous enverriez normalement à un candidat ou un client). SourcingOS l'analyse et en extrait des critères structurés et pondérés — obligatoires ou secondaires.

**2. Les candidats arrivent, de deux façons.** Vous les ajoutez vous-même, ou SourcingOS recherche des profils publics sur GitHub correspondant aux critères techniques de la mission. Dans ce second cas, **rien n'est ajouté sans votre validation** : vous voyez la liste des profils trouvés, vous cochez ceux qui vous intéressent, et seule votre sélection est importée.

**3. Chaque affirmation devient une preuve traçable.** « Maîtrise TypeScript », « disponible en freelance » — chaque critère a un statut explicite : vérifié par vous, jamais vérifié, contredit, ou simple signal détecté automatiquement (par exemple, un dépôt de code public dans un langage donné). Un signal automatique **ne devient jamais** une preuve vérifiée sans que vous l'ayez confirmé vous-même.

**4. Le statut du candidat est calculé, pas déclaré.**

| Statut affiché | Signification |
|---|---|
| **Non éligible** | Un critère obligatoire a été contredit |
| **À vérifier** | Au moins un critère obligatoire n'a jamais été prouvé — pas rejeté, juste pas encore confirmé |
| *(score affiché, ex. 87/100)* | Tous les critères obligatoires sont vérifiés |

**Un candidat au CV impressionnant mais dont un critère obligatoire est contredit reste « Non éligible ». Aucun score ne s'affiche pour lui — le système ne peut pas le laisser passer par erreur, la règle est appliquée au niveau technique le plus bas, pas juste dans l'écran que vous voyez.**

**5. Le score ne concerne que les candidats éligibles.** Il vous aide à prioriser entre plusieurs profils qui ont tous passé la barre des critères obligatoires — jamais à décider qui la passe.

**6. La shortlist ne peut techniquement pas contenir un candidat non éligible.** Ce n'est pas une convention d'interface — même une tentative de contournement direct de la base de données serait rejetée.

## Le dossier candidat

Chaque candidat conserve un historique consultable : quels critères, avec quelle preuve, par qui vérifiés et quand. Utile pour justifier une décision de sourcing auprès d'un client, ou reprendre un dossier laissé en pause.

## Contacter un candidat trouvé sur GitHub

Pour un profil découvert via GitHub, SourcingOS génère un brouillon de message contextualisé à la mission. **Vous le relisez, le modifiez si besoin, puis le copiez pour l'envoyer depuis votre propre messagerie.** SourcingOS ne l'envoie jamais lui-même — il n'y a aujourd'hui aucune adresse email récupérée automatiquement, ce serait d'ailleurs une fausse promesse de prétendre l'envoyer sans destinataire connu.

Une fois le message envoyé, vous cliquez « Marquer comme contacté » — ça trace le contact, pas un envoi que le système n'a pas fait.

Vous enregistrez ensuite la réponse : **Intéressé**, **Refus**, ou **Opposition**.

## La gestion de l'opposition — pas un simple statut

Si un candidat signale qu'il ne souhaite plus être contacté, SourcingOS l'enregistre durablement, dans un registre séparé du dossier candidat lui-même. Concrètement : même si la fiche candidat est supprimée plus tard, l'opposition reste active. Une future recherche GitHub qui retomberait sur le même profil ne le proposera plus.

Cette opposition ne s'applique qu'à vous — un autre cabinet utilisant SourcingOS sur le même profil public n'est pas concerné par votre opposition.

## Ce que SourcingOS ne fait pas

- Il n'envoie **aucun email automatiquement**. Chaque contact est une action volontaire de votre part.
- Il ne sourcera aujourd'hui que via **GitHub** — pas LinkedIn, pas d'autre plateforme.
- Il ne décide jamais à votre place qu'un candidat est qualifié — il refuse simplement de vous laisser en shortlister un qui ne remplit pas les critères obligatoires que vous avez posés.
- Il n'invente jamais une preuve. S'il ne sait pas, il l'affiche comme « à vérifier », pas comme validé par optimisme.

## Pourquoi l'humain reste dans la boucle

Chaque décision qui engage — confirmer une compétence, sélectionner un profil à importer, envoyer un message, enregistrer une réponse — passe par une action volontaire de votre part. SourcingOS structure et trace, il ne remplace jamais le jugement du recruteur sur les décisions qui comptent.

## Exemple concret

Mission : Fullstack Senior, disponibilité freelance, expérience startup. SourcingOS trouve 18 profils GitHub correspondant aux compétences techniques. Après votre revue :

- 8 profils sont éligibles, avec un score qui les classe entre eux
- 5 sont « à vérifier » (compétences confirmées, mais rien ne prouve encore la disponibilité freelance déclarée)
- 5 sont « non éligibles » — dont un profil techniquement excellent, exclu parce qu'un point précis (statut freelance) a été explicitement contredit

Vous contactez les 8 éligibles en priorité, sans jamais avoir eu à trier manuellement les 18 profils un par un pour éliminer les non-pertinents.

## Un pilote

Un pilote consiste à traiter une ou plusieurs de vos missions réelles sur SourcingOS, de la mise en critères à la shortlist, avec votre revue à chaque étape qui le nécessite. L'objectif est de vous laisser juger sur un cas concret plutôt que sur une démonstration abstraite.
