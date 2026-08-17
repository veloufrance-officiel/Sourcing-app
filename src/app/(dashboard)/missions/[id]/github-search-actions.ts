'use server'

import { logServerError } from '@/lib/log'

// Aucune écriture en base ici, volontairement. Cette action ne fait que
// consulter GitHub et retourner des résultats temporaires — le
// recruteur doit explicitement sélectionner puis importer avant que
// quoi que ce soit ne devienne un candidat SourcingOS. Même principe
// que "aucun signal ne devient VERIFIED automatiquement", appliqué une
// couche plus haut : aucun résultat de recherche ne devient candidat
// automatiquement.

export type GithubSearchResult = {
  id: number
  login: string
  name: string | null
  bio: string | null
  location: string | null
  company: string | null
  htmlUrl: string
  publicRepos: number
  // Signaux bruts observés, pas encore transformés en evidence — ça
  // n'arrive qu'à l'import, jamais ici.
  detectedSkills: string[]
}

export type SearchGithubCandidatesState = {
  error?: string
  results?: GithubSearchResult[]
}

// Vocabulaire volontairement restreint et explicite plutôt qu'un mapping
// générique trop permissif — chaque entrée correspond à un vrai
// paramètre `language:` GitHub, pas une extraction heuristique du texte
// libre du brief. Étendre cette liste est un choix délibéré à chaque
// fois, pas un fourre-tout.
const CRITERION_TO_GITHUB_LANGUAGE: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  react: 'JavaScript', // React n'est pas un "langage" GitHub — mappé sur son langage porteur, avec les limites que ça implique (documentées dans le rapport, pas cachées)
  'node.js': 'JavaScript',
  nodejs: 'JavaScript',
  go: 'Go',
  golang: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  ruby: 'Ruby',
  php: 'PHP',
  swift: 'Swift',
}

function buildGithubQuery(criteriaLabels: string[], location: string | null): string[] {
  const languages = new Set<string>()
  for (const label of criteriaLabels) {
    const normalized = label.toLowerCase().trim()
    const mapped = CRITERION_TO_GITHUB_LANGUAGE[normalized]
    if (mapped) languages.add(mapped)
  }
  if (languages.size === 0) return []

  const locationPart = location && location.toLowerCase() !== 'remote' ? ` location:${location}` : ''
  // repos:>5 : seuil minimal de crédibilité, pas une garantie de
  // compétence — juste un filtre pour écarter les comptes quasi vides.
  return Array.from(languages).map((lang) => `language:${lang}${locationPart} repos:>5`)
}

export async function searchGithubCandidates(
  _prevState: SearchGithubCandidatesState,
  formData: FormData
): Promise<SearchGithubCandidatesState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const criteriaLabelsRaw = String(formData.get('criteria_labels') ?? '')
  const location = String(formData.get('location') ?? '') || null

  if (!missionId) return { error: 'Mission manquante.' }

  const criteriaLabels = criteriaLabelsRaw.split('|').filter(Boolean)
  const queries = buildGithubQuery(criteriaLabels, location)

  if (queries.length === 0) {
    return { error: "Aucun critère de cette mission ne correspond à un langage reconnu par la recherche GitHub." }
  }

  const token = process.env.GITHUB_SEARCH_TOKEN
  if (!token) {
    logServerError('github.search', new Error('GITHUB_SEARCH_TOKEN absent'), { missionId })
    return { error: 'Recherche GitHub indisponible pour le moment.' }
  }

  try {
    const loginsSeen = new Set<string>()
    const detailed: GithubSearchResult[] = []

    // Une requête par langage détecté, plafonné à 2 pour rester dans un
    // budget de requêtes raisonnable pour un seul clic recruteur — pas
    // de pagination automatique, pas de boucle non bornée.
    for (const query of queries.slice(0, 2)) {
      const searchRes = await fetch(
        `https://api.github.com/search/users?q=${encodeURIComponent(query)}&per_page=15`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        }
      )
      if (!searchRes.ok) {
        logServerError('github.search.searchCall', new Error(`GitHub search ${searchRes.status}`), { query })
        continue // une requête qui échoue ne doit pas faire échouer toute la recherche
      }
      const searchData = (await searchRes.json()) as { items: { login: string }[] }

      for (const item of searchData.items ?? []) {
        if (loginsSeen.has(item.login)) continue
        loginsSeen.add(item.login)

        const userRes = await fetch(`https://api.github.com/users/${item.login}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        })
        if (!userRes.ok) continue // profil individuel indisponible, on ignore plutôt que de faire échouer le lot
        const user = (await userRes.json()) as {
          id: number
          login: string
          name: string | null
          bio: string | null
          location: string | null
          company: string | null
          html_url: string
          public_repos: number
        }

        // Signal détecté = le langage qui a produit cette requête. Reste
        // un signal brut à ce stade, jamais transformé en evidence ici.
        detailed.push({
          id: user.id,
          login: user.login,
          name: user.name,
          bio: user.bio,
          location: user.location,
          company: user.company,
          htmlUrl: user.html_url,
          publicRepos: user.public_repos,
          detectedSkills: [query.match(/language:(\S+)/)?.[1] ?? ''].filter(Boolean),
        })

        if (detailed.length >= 20) break
      }
      if (detailed.length >= 20) break
    }

    if (detailed.length === 0) {
      return { error: 'Aucun profil trouvé pour ces critères.' }
    }

    return { results: detailed }
  } catch (err) {
    logServerError('github.search', err, { missionId })
    return { error: 'Impossible de contacter GitHub pour le moment.' }
  }
}
