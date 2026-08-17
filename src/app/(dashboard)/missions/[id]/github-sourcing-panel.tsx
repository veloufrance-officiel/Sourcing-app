'use client'

import { useActionState, useState } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import { searchGithubCandidates, type GithubSearchResult, type SearchGithubCandidatesState } from './github-search-actions'
import { importGithubCandidates, type ImportGithubCandidatesState } from './github-import-actions'

const initialSearchState: SearchGithubCandidatesState = {}
const initialImportState: ImportGithubCandidatesState = {}

export function GithubSourcingPanel({
  missionId,
  criteriaLabels,
  location,
}: {
  missionId: string
  criteriaLabels: string[]
  location: string | null
}) {
  const [open, setOpen] = useState(false)
  const [searchState, searchAction, searching] = useActionState(searchGithubCandidates, initialSearchState)
  const [importState, importAction, importing] = useActionState(importGithubCandidates, initialImportState)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const results = searchState.results ?? []

  function toggle(login: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(login)) next.delete(login)
      else next.add(login)
      return next
    })
  }

  const selectedProfiles: GithubSearchResult[] = results.filter((r) => selected.has(r.login))

  if (importState.imported) {
    return (
      <div className="rounded-lg border border-line bg-signal-soft p-3 text-sm text-signal">
        {importState.imported} profil{importState.imported > 1 ? 's' : ''} importé
        {importState.imported > 1 ? 's' : ''} — statut « À vérifier » jusqu&apos;à confirmation, consentement à obtenir avant toute shortlist.
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-paper"
      >
        <Globe className="h-3.5 w-3.5" />
        Sourcing public (GitHub)
      </button>

      {open ? (
        <div className="mt-3 rounded-lg border border-line p-4">
          {results.length === 0 ? (
            <form action={searchAction} className="space-y-2">
              <input type="hidden" name="mission_id" value={missionId} />
              <input type="hidden" name="criteria_labels" value={criteriaLabels.join('|')} />
              <input type="hidden" name="location" value={location ?? ''} />
              <p className="text-xs text-slate">
                Recherche des profils GitHub publics correspondant aux critères de cette mission. Aucun candidat
                n&apos;est créé à cette étape — seulement des résultats à sélectionner.
              </p>
              {searchState.error ? <p className="text-xs text-amber">{searchState.error}</p> : null}
              <button
                type="submit"
                disabled={searching}
                className="flex items-center gap-1.5 rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-white hover:bg-signal/90 disabled:opacity-50"
              >
                {searching ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                {searching ? 'Recherche…' : 'Rechercher sur GitHub'}
              </button>
            </form>
          ) : (
            <form action={importAction} className="space-y-3">
              <input type="hidden" name="mission_id" value={missionId} />
              <input type="hidden" name="selected_profiles" value={JSON.stringify(selectedProfiles)} />
              <p className="text-xs text-slate">
                {results.length} profil{results.length > 1 ? 's' : ''} trouvé{results.length > 1 ? 's' : ''}. Sélectionnez
                ceux à importer — les autres restent ignorés, rien n&apos;est enregistré pour eux.
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {results.map((r) => (
                  <label
                    key={r.login}
                    className="flex items-start gap-2 rounded-md border border-line p-2 text-xs hover:bg-paper"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.login)}
                      onChange={() => toggle(r.login)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold text-ink">{r.name || r.login}</span>{' '}
                      <span className="text-slate">@{r.login}</span>
                      {r.location ? <span className="text-slate"> · {r.location}</span> : null}
                      {r.bio ? <p className="mt-0.5 text-slate">{r.bio}</p> : null}
                      <p className="mt-0.5 text-slate">
                        {r.publicRepos} dépôts publics · signal détecté : {r.detectedSkills.join(', ') || '—'}
                      </p>
                    </span>
                  </label>
                ))}
              </div>
              {importState.error ? <p className="text-xs text-amber">{importState.error}</p> : null}
              <button
                type="submit"
                disabled={importing || selectedProfiles.length === 0}
                className="rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-white hover:bg-signal/90 disabled:opacity-50"
              >
                {importing ? 'Import…' : `Importer ${selectedProfiles.length} profil${selectedProfiles.length > 1 ? 's' : ''}`}
              </button>
            </form>
          )}
        </div>
      ) : null}
    </div>
  )
}
