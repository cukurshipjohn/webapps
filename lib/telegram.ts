export async function sendTelegramMessage(
  chatId: string,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || !chatId) return

  await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        text,
        parse_mode: 'Markdown',
      }),
    }
  ).catch(() => {
    // Notifikasi gagal tidak boleh throw error ke client
    console.error('Failed to send Telegram notification')
  })
}
