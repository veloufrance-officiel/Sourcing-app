// Notifications Telegram côté application (erreurs, nouvelle mission).
// Le cas "nouvel utilisateur" est géré séparément par un trigger Postgres
// (internal.notify_telegram, via pg_net + Vault) pour capter aussi bien un
// provisionnement manuel qu'un futur flux self-serve.
//
// Principe non négociable : une notification qui échoue ne doit JAMAIS faire
// échouer l'action réelle (créer une mission, logger une erreur...). D'où le
// try/catch qui avale tout, et l'absence de configuration qui ne fait rien
// plutôt que planter.

export async function sendTelegramMessage(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
  } catch {
    // Telegram indisponible : on ne remonte jamais cette erreur à l'appelant.
  }
}
