import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Deux projets de test dans ce fichier unique plutôt que deux configs
// séparées : matching.test.ts/eligibility.test.ts (fonctions pures,
// déjà existants) tournent en environnement node par défaut, sans
// changement. Les tests de composant/Server Action (nouveaux, PR3) ont
// besoin de jsdom et de l'alias @/ (jusqu'ici jamais résolu par Vitest,
// seulement par le build Next.js réel).
//
// environmentMatchGlobs (glob sur le chemin) écarté délibérément : les
// routes Next.js dynamiques de ce projet contiennent des crochets
// ([id], [shortlistId]) qui sont interprétés comme des classes de
// caractères glob, pas du texte littéral — [id] matche "i" ou "d",
// cassant silencieusement le pattern. environment défini directement
// dans chaque fichier de test via un commentaire magique Vitest à la
// place, fiable indépendamment du chemin.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    // mobile/ a sa propre stack de test (Jest, pas Vitest — voie
    // officiellement recommandée par Expo pour React Native, vérifié
    // avant de l'installer). Sans cette exclusion, Vitest scanne aussi
    // les fichiers .test.tsx du dossier mobile et échoue à parser leur
    // JSX React Native (SyntaxError sur des tokens comme `typeof`) —
    // trou d'isolation jamais couvert par le default exclude de
    // Vitest, découvert en ajoutant le premier test mobile.
    exclude: ['**/node_modules/**', '**/mobile/**'],
  },
})
