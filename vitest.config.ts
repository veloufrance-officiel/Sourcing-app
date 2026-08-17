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
  },
})
