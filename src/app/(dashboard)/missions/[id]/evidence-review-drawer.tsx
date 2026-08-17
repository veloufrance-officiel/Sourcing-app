'use client'

import { useActionState, useState } from 'react'
import { CheckCircle2, ShieldQuestion, X, XCircle } from 'lucide-react'
import { confirmEvidence, type ConfirmEvidenceState } from './evidence-actions'

export type EvidenceCriterion = {
  criterionId: string
  label: string
  weight: number
  // Statut le plus récent non-supersédé pour ce (candidat, critère), ou
  // null si aucune preuve n'existe encore. INFERRED_UNCONFIRMED distingué
  // explicitement de VERIFIED — jamais confondu visuellement, cohérent
  // avec la contrainte déjà posée en base (evidence_inference_never_verified).
  status: 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED' | null
  sourceType: string | null
  verificationMethod: string | null
  verifiedAt: string | null
}

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: 'Vérifié',
  CONTRADICTED: 'Contredit',
  NOT_VERIFIED: 'Non vérifié',
  INFERRED_UNCONFIRMED: 'Déduit — non confirmé',
}

function StatusBadge({ status }: { status: EvidenceCriterion['status'] }) {
  if (status === 'VERIFIED') {
    return (
      <span className="flex items-center gap-1 rounded-md bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal">
        <CheckCircle2 className="h-3 w-3" />
        Vérifié
      </span>
    )
  }
  if (status === 'CONTRADICTED') {
    return (
      <span className="flex items-center gap-1 rounded-md bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber">
        <XCircle className="h-3 w-3" />
        Contredit
      </span>
    )
  }
  // NOT_VERIFIED et INFERRED_UNCONFIRMED partagent le même style visuel
  // neutre — ni l'un ni l'autre n'est une confirmation, jamais coloré
  // comme VERIFIED. Le libellé distingue les deux cas, la couleur non.
  return (
    <span className="flex items-center gap-1 rounded-md bg-line px-2 py-0.5 text-[11px] font-medium text-slate">
      <ShieldQuestion className="h-3 w-3" />
      {STATUS_LABEL[status ?? 'NOT_VERIFIED']}
    </span>
  )
}

const initialState: ConfirmEvidenceState = {}

function ConfirmForm({
  candidateId,
  criterionId,
  missionId,
}: {
  candidateId: string
  criterionId: string
  missionId: string
}) {
  const [state, formAction, pending] = useActionState(confirmEvidence, initialState)
  const [text, setText] = useState('')
  const [method, setMethod] = useState('')

  if (state.success) {
    return <p className="text-xs text-signal">Enregistré.</p>
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg bg-paper p-3">
      <input type="hidden" name="candidate_id" value={candidateId} />
      <input type="hidden" name="criterion_id" value={criterionId} />
      <input type="hidden" name="mission_id" value={missionId} />
      <div>
        <label htmlFor={`evidence_text_${criterionId}`} className="block text-[11px] font-medium text-slate">
          Justification (optionnel)
        </label>
        <input
          id={`evidence_text_${criterionId}`}
          name="evidence_text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ex : confirmé au téléphone, CV fourni..."
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-signal"
        />
      </div>
      <div>
        <label htmlFor={`method_${criterionId}`} className="block text-[11px] font-medium text-slate">
          Méthode de vérification (optionnel)
        </label>
        <input
          id={`method_${criterionId}`}
          name="verification_method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Ex : appel, CV, référence"
          className="mt-1 w-full rounded-md border border-line bg-white px-2 py-1.5 text-xs text-ink outline-none focus:border-signal"
        />
      </div>
      {state.error ? <p className="text-xs text-amber">{state.error}</p> : null}
      <div className="flex gap-2">
        <button
          type="submit"
          name="status"
          value="VERIFIED"
          disabled={pending}
          className="rounded-md bg-signal px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-signal/90 disabled:opacity-50"
        >
          {pending ? '…' : 'Marquer vérifié'}
        </button>
        <button
          type="submit"
          name="status"
          value="CONTRADICTED"
          disabled={pending}
          className="rounded-md bg-amber px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-amber/90 disabled:opacity-50"
        >
          {pending ? '…' : 'Marquer contredit'}
        </button>
      </div>
    </form>
  )
}

export function EvidenceReviewDrawer({
  candidateId,
  candidateName,
  missionId,
  eligibilityStatus,
  criteria,
}: {
  candidateId: string
  candidateName: string
  missionId: string
  eligibilityStatus: 'ELIGIBLE' | 'NOT_QUALIFIED' | 'INELIGIBLE'
  criteria: EvidenceCriterion[]
}) {
  const [open, setOpen] = useState(false)
  const [confirmingCriterionId, setConfirmingCriterionId] = useState<string | null>(null)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-medium text-signal hover:underline"
      >
        Revoir les preuves
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-display text-base font-semibold text-ink">{candidateName}</p>
                <p className="mt-0.5 text-xs text-slate">
                  Statut d&apos;éligibilité : <span className="font-medium text-ink">{eligibilityStatus}</span>
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-slate hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-slate">
              Critères obligatoires
            </p>
            <div className="mt-2 space-y-3">
              {criteria.length === 0 ? (
                <p className="text-xs text-slate">Aucun critère obligatoire sur cette mission.</p>
              ) : (
                criteria.map((c) => (
                  <div key={c.criterionId} className="rounded-lg border border-line p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm text-ink">{c.label}</p>
                      <StatusBadge status={c.status} />
                    </div>
                    {c.sourceType || c.verificationMethod ? (
                      <p className="mt-1 text-[11px] text-slate">
                        {c.sourceType ? `Source : ${c.sourceType}` : null}
                        {c.sourceType && c.verificationMethod ? ' · ' : null}
                        {c.verificationMethod ? `Méthode : ${c.verificationMethod}` : null}
                      </p>
                    ) : null}

                    {confirmingCriterionId === c.criterionId ? (
                      <ConfirmForm candidateId={candidateId} criterionId={c.criterionId} missionId={missionId} />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingCriterionId(c.criterionId)}
                        className="mt-2 text-[11px] font-medium text-signal hover:underline"
                      >
                        Confirmer ce critère
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
