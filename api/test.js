module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(200).json({ status: 'ERREUR', message: 'ANTHROPIC_API_KEY absente de Vercel' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Dis juste OK' }]
      })
    })

    const text = await response.text()
    return res.status(200).json({
      status: response.ok ? 'OK' : 'ERREUR',
      http_status: response.status,
      reponse: text.substring(0, 500)
    })
  } catch(e) {
    return res.status(200).json({ status: 'ERREUR', message: e.message })
  }
}
