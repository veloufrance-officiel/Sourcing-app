import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Nettoyage du DOM entre chaque test — sans ça, les rendus s'accumulent
// dans le même document jsdom partagé, causant des "multiple elements
// found" sur des sélecteurs par texte qui n'ont pourtant rien
// d'ambigu individuellement.
afterEach(() => {
  cleanup()
})
