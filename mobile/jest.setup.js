// Charge .env.test avant l'exécution des tests — jest-expo ne charge
// jamais automatiquement les fichiers .env, contrairement à `expo
// start` (confirmé par un issue GitHub officiel du repo expo/expo,
// pas une supposition). Sans ce fichier, tout composant qui importe
// lib/supabase.ts échoue au chargement (garde-fou intentionnel de ce
// fichier, correct pour l'app réelle, pas pour un test unitaire de
// composant pur qui n'a jamais besoin de vraiment appeler Supabase).
require('dotenv').config({ path: require('path').resolve(__dirname, '.env.test'), quiet: true })
