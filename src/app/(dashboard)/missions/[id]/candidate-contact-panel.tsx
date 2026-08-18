'use client'

import { useActionState, useState } from 'react'
import { MessageCircle, X } from 'lucide-react'
import {
  markCandidateContacted,
  recordCandidateResponse,
  type MarkCandidateContactedState,
  type RecordCandidateResponseState,
} from './candidate-contact-actions'

export type ExistingContact = {
  id: string
  missionTitle: string
  sentAt: string
  sentByName: string | null
  response: 'interested' | 'refused' | 'opposed' | null
}

const initialMarkState: MarkCandidateContactedState = {}
const initialResponseState: RecordCandidateResponseState = {}

// Brouillon contextualisé, structure minimale imposée plutôt qu'un
// texte juridique automatique — reste humain et professionnel, jamais
// enfermé dans une longue mention RGPD.
function buildDraftMessage(candidateName: string, missionTitle: string): string {
  const firstName = candidateName.split(' ')[0] || candidateName
  return `Bonjour ${firstName},

Je vous contacte dans le cadre d'une mission "${missionTitle}" qui pourrait correspondre à votre expérience.

[Présentation courte de la mission / contexte à compléter.]

Si vous êtes ouvert à en discuter, je peux vous transmettre davantage d'informations.

Si vous ne souhaitez pas recevoir ce type de sollicitations de ma part, vous pouvez simplement me le signaler et je prendrai en compte votre opposition.`
}

const RESPONSE_LABEL: Record<string, string> = {
  interested: 'Intéressé',
  refused: 'Refus',
  opposed: 'Opposition',
}

function ResponseForm({ contactId, missionId }: { contactId: string; missionId: string }) {
  const [state, formAction, pending] = useActionState(recordCandidateResponse, initialResponseState)

  if (state.success) {
    return <p className="text-xs text-signal">Réponse enregistrée.</p>
  }

  return (
    <form action={formAction} className="mt-1 flex items-center gap-1.5">
      <input type="hidden" name="contact_id" value={contactId} />
      <input type="hidden" name="mission_id" value={missionId} />
      {(['interested', 'refused', 'opposed'] as const).map((r) => (
        <button
          key={r}
          type="submit"
          name="response"
          value={r}
          disabled={pending}
          className="rounded-md border border-line px-2 py-0.5 text-[10px] font-medium text-ink hover:bg-paper disabled:opacity-50"
        >
          {RESPONSE_LABEL[r]}
        </button>
      ))}
      {state.error ? <p className="text-[10px] text-amber">{state.error}</p> : null}
    </form>
  )
}

export function CandidateContactPanel({
  candidateId,
  candidateName,
  missionId,
  missionTitle,
  isGithubSourced,
  existingContacts,
}: {
  candidateId: string
  candidateName: string
  missionId: string
  missionTitle: string
  isGithubSourced: boolean
  existingContacts: ExistingContact[]
}) {
  const [open, setOpen] = useState(false)
  const [markState, markAction, marking] = useActionState(markCandidateContacted, initialMarkState)
  const [message, setMessage] = useState(() => buildDraftMessage(candidateName, missionTitle))

  // Le mécanisme repose sur github_user_id pour vérifier l'opposition —
  // sans intérêt pour un candidat saisi manuellement, qui n'a jamais
  // cette donnée.
  if (!isGithubSourced) return null

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-[11px] font-medium text-signal hover:underline"
      >
        <MessageCircle className="h-3 w-3" />
        Contacter
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-ink/20" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-semibold text-ink">{candidateName}</p>
              <button type="button" onClick={() => setOpen(false)} className="text-slate hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate">Mission : {missionTitle}</p>

            {existingContacts.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate">Contacts précédents</p>
                {existingContacts.map((c) => (
                  <div key={c.id} className="rounded-md border border-line p-2 text-xs">
                    <p className="text-slate">
                      {c.missionTitle} — {new Date(c.sentAt).toLocaleDateString('fr-FR')}
                      {c.sentByName ? ` — par ${c.sentByName}` : ''}
                    </p>
                    {c.response ? (
                      <p className="mt-0.5 font-medium text-ink">
                        Statut : {RESPONSE_LABEL[c.response]}
                        {c.response === 'opposed' ? (
                          <span className="ml-1 text-amber">
                            — opposition enregistrée, ce profil sera exclu des futurs contacts.
                          </span>
                        ) : null}
                      </p>
                    ) : (
                      <>
                        <p className="mt-0.5 text-slate">En attente de réponse</p>
                        <ResponseForm contactId={c.id} missionId={missionId} />
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {markState.contactId ? (
              <div className="mt-4 rounded-md border border-line bg-signal-soft p-3 text-xs text-signal">
                Contact enregistré — {new Date().toLocaleDateString('fr-FR')}. Copiez le message ci-dessus dans votre
                canal réel pour l&apos;envoyer.
              </div>
            ) : (
              <form action={markAction} className="mt-4 space-y-2">
                <input type="hidden" name="candidate_id" value={candidateId} />
                <input type="hidden" name="mission_id" value={missionId} />
                <input type="hidden" name="message" value={message} />
                <label htmlFor="contact-message" className="block text-[11px] font-medium text-slate">
                  Message (généré, éditable)
                </label>
                <textarea
                  id="contact-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={10}
                  className="w-full rounded-md border border-line bg-paper px-2 py-1.5 text-xs text-ink outline-none focus:border-signal"
                />
                {markState.error ? <p className="text-xs text-amber">{markState.error}</p> : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(message)}
                    className="rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper"
                  >
                    Copier le message
                  </button>
                  <button
                    type="submit"
                    disabled={marking}
                    className="rounded-md bg-signal px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-signal/90 disabled:opacity-50"
                  >
                    {marking ? '…' : 'Marquer comme contacté'}
                  </button>
                </div>
                <p className="text-[10px] text-slate">
                  SourcingOS n&apos;envoie pas ce message. Copiez-le puis envoyez-le depuis votre canal réel.
                </p>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
