// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EvidenceReviewDrawer, type EvidenceCriterion } from './evidence-review-drawer'

vi.mock('./evidence-actions', () => ({
  confirmEvidence: vi.fn(async () => ({ success: true })),
}))

const baseCriteria: EvidenceCriterion[] = [
  {
    criterionId: 'c1',
    label: 'React',
    weight: 3,
    status: 'VERIFIED',
    sourceType: 'recruiter_note',
    verificationMethod: 'appel',
    verifiedAt: '2026-08-17T00:00:00Z',
  },
  {
    criterionId: 'c2',
    label: '5 ans d\u2019expérience',
    weight: 3,
    status: null,
    sourceType: null,
    verificationMethod: null,
    verifiedAt: null,
  },
  {
    criterionId: 'c3',
    label: 'TypeScript',
    weight: 3,
    status: 'CONTRADICTED',
    sourceType: 'recruiter_note',
    verificationMethod: null,
    verifiedAt: '2026-08-17T00:00:00Z',
  },
]

function renderDrawer(criteria: EvidenceCriterion[] = baseCriteria) {
  return render(
    <EvidenceReviewDrawer
      candidateId="candidate-1"
      candidateName="Camille Dubois"
      missionId="mission-1"
      eligibilityStatus="NOT_QUALIFIED"
      criteria={criteria}
    />
  )
}

describe('EvidenceReviewDrawer', () => {
  it('le drawer est fermé par défaut, seul le déclencheur est visible', () => {
    renderDrawer()
    expect(screen.getByText('Revoir les preuves')).toBeInTheDocument()
    expect(screen.queryByText('Camille Dubois')).not.toBeInTheDocument()
  })

  it('ouvre le drawer au clic et affiche le statut d\u2019éligibilité', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('Camille Dubois')).toBeInTheDocument()
    expect(screen.getByText('NOT_QUALIFIED')).toBeInTheDocument()
  })

  it('affiche chaque critère obligatoire avec son statut', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('React')).toBeInTheDocument()
    expect(screen.getByText('Vérifié')).toBeInTheDocument()
    expect(screen.getByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Contredit')).toBeInTheDocument()
  })

  it('un critère sans preuve affiche "Non vérifié", jamais confondu avec "Vérifié"', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('Non vérifié')).toBeInTheDocument()
  })

  it('un statut INFERRED_UNCONFIRMED affiche un libellé distinct de "Vérifié", jamais confondu visuellement', async () => {
    const user = userEvent.setup()
    renderDrawer([
      {
        criterionId: 'c4',
        label: 'Node.js',
        weight: 3,
        status: 'INFERRED_UNCONFIRMED',
        sourceType: 'web_search',
        verificationMethod: null,
        verifiedAt: null,
      },
    ])
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('Déduit — non confirmé')).toBeInTheDocument()
    expect(screen.queryByText('Vérifié')).not.toBeInTheDocument()
  })

  it('affiche la source et la méthode quand disponibles', async () => {
    const user = userEvent.setup()
    renderDrawer([baseCriteria[0]!])
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText(/Source : recruiter_note/)).toBeInTheDocument()
    expect(screen.getByText(/Méthode : appel/)).toBeInTheDocument()
  })

  it('le bouton "Confirmer ce critère" révèle le formulaire de confirmation', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByText('Revoir les preuves'))
    const confirmButtons = screen.getAllByText('Confirmer ce critère')
    await user.click(confirmButtons[0]!)
    expect(screen.getByText('Marquer vérifié')).toBeInTheDocument()
    expect(screen.getByText('Marquer contredit')).toBeInTheDocument()
  })

  it('mission sans critère obligatoire affiche un message explicite, pas une liste vide silencieuse', async () => {
    const user = userEvent.setup()
    renderDrawer([])
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('Aucun critère obligatoire sur cette mission.')).toBeInTheDocument()
  })

  it('le bouton fermer ferme le drawer', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await user.click(screen.getByText('Revoir les preuves'))
    expect(screen.getByText('Camille Dubois')).toBeInTheDocument()
    const closeButton = screen.getByRole('button', { name: '' })
    await user.click(closeButton)
    expect(screen.queryByText('Camille Dubois')).not.toBeInTheDocument()
  })
})
