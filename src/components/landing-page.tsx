import Link from 'next/link'
import { ArrowRight, FileText, Globe2, ListChecks, ShieldCheck, Sparkles, Target } from 'lucide-react'

const FEATURES = [
  {
    icon: FileText,
    title: 'Analyse IA du brief',
    description:
      "Colle le brief client tel quel, l'IA en extrait les critères de sélection avec leur niveau d'importance.",
  },
  {
    icon: Target,
    title: 'Scoring transparent',
    description:
      'Chaque profil est noté par rapport aux critères réels de la mission — et tu vois exactement ce qui correspond et ce qui manque, jamais une boîte noire.',
  },
  {
    icon: ListChecks,
    title: 'Pipeline par mission',
    description: 'Missions, profils et statuts organisés mission par mission, du premier contact au placement.',
  },
  {
    icon: Globe2,
    title: 'Shortlists partageables',
    description:
      "Un lien de lecture seule pour présenter une shortlist en externe, sans compte requis, sans exposer les coordonnées.",
  },
]

export function LandingPage() {
  return (
    <main className="bg-paper">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-ink">OrakL</p>
        <Link href="/login" className="text-sm font-medium text-slate hover:text-ink">
          Se connecter
        </Link>
      </header>

      <section className="relative overflow-hidden px-6 py-20 text-center sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/3 rounded-full bg-signal opacity-[0.07] blur-3xl"
        />
        <div className="relative mx-auto max-w-2xl">
          <p className="font-display text-sm uppercase tracking-[0.25em] text-slate">Sourcing OS</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Pré-qualifie tes freelances,
            <br />
            présente les bons profils.
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-base text-slate">
            Le pipeline de sourcing pour cabinets et indépendants : brief analysé par IA, profils scorés
            objectivement, shortlists prêtes à partager.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-ink/90"
            >
              Essayer gratuitement — 7 jours
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="rounded-lg border border-line bg-white px-6 py-3 text-sm font-medium text-ink hover:border-signal"
            >
              Se connecter
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate">Sans carte bancaire. Annulable à tout moment.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-xl border border-line bg-white p-5 shadow-sm">
              <feature.icon className="h-5 w-5 text-signal" />
              <p className="mt-3 font-display text-base font-semibold text-ink">{feature.title}</p>
              <p className="mt-1.5 text-sm text-slate">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-line bg-white p-8 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-signal" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate">Bientôt — freelances premium</p>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink">
            Une mise en avant pour les freelances selon leur stack, leur localisation et leur disponibilité,
            avec un accès anticipé aux nouvelles missions. En conception — la priorité reste et restera
            l&apos;adéquation réelle au poste, jamais un simple abonnement qui achète un classement.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="flex items-center justify-center gap-2 text-xs text-slate">
          <ShieldCheck className="h-3.5 w-3.5" />
          Isolation stricte des données par organisation, testée et vérifiée.
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Prêt à essayer ?</h2>
        <Link
          href="/login"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-medium text-paper hover:bg-ink/90"
        >
          Essayer gratuitement — 7 jours
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-slate">
        OrakL — Sourcing OS
      </footer>
    </main>
  )
}
