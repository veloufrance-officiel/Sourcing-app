// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EvidenceAgentButton } from './evidence-agent-button'

vi.mock('./evidence-agent-server-action', () => ({
  runEvidenceAgent: vi.fn(async () => ({ saved: 0, proposed: 0 })),
}))

describe('EvidenceAgentButton', () => {
  it('affiche un déclencheur explicite et transmet mission/candidat', () => {
    const { container } = render(
      <EvidenceAgentButton missionId="mission-1" candidateId="candidate-1" />
    )

    expect(screen.getByRole('button', { name: 'Analyser les preuves' })).toBeInTheDocument()
    expect(container.querySelector('input[name="mission_id"]')).toHaveValue('mission-1')
    expect(container.querySelector('input[name="candidate_id"]')).toHaveValue('candidate-1')
  })
})
