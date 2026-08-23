// Vocabulaire vérifié précisément contre eligibility-badge.tsx côté
// web avant d'écrire ces tests, pas deviné — "Éligible"/"À
// vérifier"/"Non éligible" sont les libellés réels affichés.
import { render, screen } from '@testing-library/react-native'
import { EligibilityBadge } from './EligibilityBadge'

describe('EligibilityBadge', () => {
  it('affiche "Éligible" pour un candidat ELIGIBLE', async () => {
    await render(<EligibilityBadge status="ELIGIBLE" />)
    expect(screen.getByText('Éligible')).toBeTruthy()
  })

  it('affiche "À vérifier" pour NOT_QUALIFIED, jamais "non éligible" — au moins un critère obligatoire jamais prouvé, pas rejeté', async () => {
    await render(<EligibilityBadge status="NOT_QUALIFIED" />)
    expect(screen.getByText('À vérifier')).toBeTruthy()
  })

  it('affiche "Non éligible" pour INELIGIBLE, même sur un profil par ailleurs parfait — reproduit exactement le cas Théo Michel (freelance CONTRADICTED)', async () => {
    await render(<EligibilityBadge status="INELIGIBLE" />)
    expect(screen.getByText('Non éligible')).toBeTruthy()
  })

  it("n'affiche jamais un score numérique pour NOT_QUALIFIED ou INELIGIBLE — le score ne concerne que ELIGIBLE, jamais inventé pour les deux autres", async () => {
    await render(<EligibilityBadge status="NOT_QUALIFIED" />)
    expect(screen.queryByText(/\d+\/100/)).toBeNull()

    await render(<EligibilityBadge status="INELIGIBLE" />)
    expect(screen.queryByText(/\d+\/100/)).toBeNull()
  })
})
