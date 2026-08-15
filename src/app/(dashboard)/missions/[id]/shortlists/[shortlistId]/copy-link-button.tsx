'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Presse-papiers indisponible (contexte non sécurisé, permissions) :
      // le lien reste sélectionnable/copiable à la main juste à côté.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-paper hover:bg-ink/90"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copié' : 'Copier'}
    </button>
  )
}
