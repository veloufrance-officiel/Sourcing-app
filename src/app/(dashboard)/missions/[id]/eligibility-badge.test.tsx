// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EligibilityBadge, EligibilitySummary, summarizeEvidence } from './eligibility-badge'
import type { MatchResult } from '@/lib/matching'

const fullMatch: MatchResult = { score: 87, maxScore: 100, percent: 87, matchedCriteria: ['React'], missingCriteria: [] }

describe('EligibilityBadge — contrat exact du tableau PR4', () => {
  it('ELIGIBLE avec match → affiche score/maxScore, jamais le pourcentage seul', () => {
    render(<EligibilityBadge status="ELIGIBLE" match={fullMatch} />)
    expect(screen.getByText('87/100')).toBeInTheDocument()
  })

  it('ELIGIBLE sans match (aucun critère de scoring défini) → rien, pas un score inventé', () => {
    const { container } = render(<EligibilityBadge status="ELIGIBLE" match={null} />)
    expect(container.textContent).toBe('')
  })

  it('NOT_QUALIFIED → "À vérifier", jamais un score même si match est fourni par erreur', () => {
    render(<EligibilityBadge status="NOT_QUALIFIED" match={fullMatch} />)
    expect(screen.getByText('À vérifier')).toBeInTheDocument()
    expect(screen.queryByText('87/100')).not.toBeInTheDocument()
  })

  it('NOT_QUALIFIED sans match → toujours "À vérifier"', () => {
    render(<EligibilityBadge status="NOT_QUALIFIED" match={null} />)
    expect(screen.getByText('À vérifier')).toBeInTheDocument()
  })

  it('INELIGIBLE → "Non éligible", jamais un score même si match est fourni par erreur', () => {
    render(<EligibilityBadge status="INELIGIBLE" match={fullMatch} />)
    expect(screen.getByText('Non éligible')).toBeInTheDocument()
    expect(screen.queryByText('87/100')).not.toBeInTheDocument()
  })

  it('INELIGIBLE sans match → toujours "Non éligible"', () => {
    render(<EligibilityBadge status="INELIGIBLE" match={null} />)
    expect(screen.getByText('Non éligible')).toBeInTheDocument()
  })

  it('un second candidat ELIGIBLE avec un score différent affiche son propre score (pas de fuite entre rendus)', () => {
    const { unmount } = render(<EligibilityBadge status="ELIGIBLE" match={fullMatch} />)
    expect(screen.getByText('87/100')).toBeInTheDocument()
    unmount()
    render(<EligibilityBadge status="ELIGIBLE" match={{ ...fullMatch, score: 64 }} />)
    expect(screen.getByText('64/100')).toBeInTheDocument()
  })
})

describe('summarizeEvidence — comptage pur, sans effet de bord', () => {
  it('compte VERIFIED/CONTRADICTED/NOT_VERIFIED correctement', () => {
    const map = new Map([
      ['c1', { status: 'VERIFIED' as const }],
      ['c2', { status: 'CONTRADICTED' as const }],
      ['c3', { status: 'NOT_VERIFIED' as const }],
    ])
    expect(summarizeEvidence(['c1', 'c2', 'c3'], map)).toEqual({ verified: 1, notVerified: 1, contradicted: 1 })
  })

  it('un critère absent de la map (aucune preuve du tout) compte comme non vérifié', () => {
    const map = new Map<string, { status: 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED' }>()
    expect(summarizeEvidence(['c1'], map)).toEqual({ verified: 0, notVerified: 1, contradicted: 0 })
  })

  it("INFERRED_UNCONFIRMED compte comme non vérifié, jamais comme vérifié — cohérent avec le moteur d'éligibilité réel", () => {
    const map = new Map([['c1', { status: 'INFERRED_UNCONFIRMED' as const }]])
    expect(summarizeEvidence(['c1'], map)).toEqual({ verified: 0, notVerified: 1, contradicted: 0 })
  })
})

describe('EligibilitySummary — rendu du résumé NOT_QUALIFIED', () => {
  it('affiche le comptage exact et une action suggérée', () => {
    const evidenceMap = new Map([
      ['candidate-1:c1', { status: 'VERIFIED' as const }],
      ['candidate-1:c2', { status: 'CONTRADICTED' as const }],
    ])
    render(<EligibilitySummary criteria={[{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }]} candidateId="candidate-1" evidenceMap={evidenceMap} />)
    expect(screen.getByText(/1 vérifié/)).toBeInTheDocument()
    expect(screen.getByText(/1 non vérifié/)).toBeInTheDocument()
    expect(screen.getByText(/1 contradictoire/)).toBeInTheDocument()
    expect(screen.getByText(/obtenir des preuves pour statuer/)).toBeInTheDocument()
  })

  it("la clé utilisée correspond exactement au format candidateId:criterionId de page.tsx (pas de fuite cross-candidat)", () => {
    const evidenceMap = new Map([
      ['candidate-OTHER:c1', { status: 'VERIFIED' as const }], // preuve d'un AUTRE candidat, même critère
    ])
    render(<EligibilitySummary criteria={[{ id: 'c1' }]} candidateId="candidate-1" evidenceMap={evidenceMap} />)
    // candidate-1 n'a aucune preuve à lui — ne doit PAS hériter de celle de candidate-OTHER
    expect(screen.getByText(/0 vérifié/)).toBeInTheDocument()
    expect(screen.getByText(/1 non vérifié/)).toBeInTheDocument()
  })
})
