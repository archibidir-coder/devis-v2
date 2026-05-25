module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Cle API Anthropic manquante dans les variables Vercel.' })

  try {
    const { pdfBase64, mode } = req.body
    if (!pdfBase64 || !mode) return res.status(400).json({ error: 'Parametres manquants.' })

    const isDevis = mode === 'devis'

    const prompt = `Tu es un expert en analyse de ${mode}s de renovation energetique en France, specialiste MaPrimeRenov 2026.

Analyse ce PDF. Reponds UNIQUEMENT avec un JSON valide, sans markdown, sans backticks, sans texte avant ou apres.

IMPORTANT : Dans toutes tes valeurs texte, utilise uniquement des caracteres ASCII simples. Remplace les apostrophes par des espaces, evite les guillemets dans les valeurs.

Regles MPR 2026 : ITI/ITE non eligibles par geste. Chaudieres biomasse non eligibles. PAC air/air et hybrides exclues.
Menuiseries : Fenetres Uw<=1.3+Sw>=0.3 OU Uw<=1.7+Sw>=0.36. Velux Uw<=1.5+Sw>=0.36. Doubles fenetres Uw<=1.8+Sw>=0.36. Porte Ud<=1.7. Volets R>0.22.
Isolation : Combles R>=7. Rampants R>=6. Terrasse R>=6.5. Plancher R>=3. ITI R>=3.7. ITE R>=4.4.
PAC : BT ETAS>=126. MT ETAS>=111. CET COP>=3.
Bois : Flamme Verte 7 etoiles rendement>=87 poeles ETAS>=111 chaudieres ETAS>=126.

Reponds avec exactement ce JSON complete avec les vraies valeurs du document. Toutes les valeurs string doivent etre courtes (max 80 caracteres) et sans caracteres speciaux :

{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}${isDevis ? ',"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}' : ''},"perf_menuiseries":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_isolation":{"present":false,"conforme":null,"alerte_mpr":"","commentaire":"","details":{"surface_isoler":{"present":false,"valeur":"","commentaire":""},"type_isolant":{"present":false,"valeur":"","commentaire":""},"epaisseur":{"present":false,"valeur":"","commentaire":""},"acermi":{"present":false,"valeur":"","commentaire":""}}},"perf_pac":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_bois":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    let raw = data.content.map(b => b.text || '').join('')
    
    // Nettoyage robuste
    raw = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
    
    // Extraire uniquement le JSON
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(500).json({ error: 'Reponse invalide. Reessayez.' })
    
    raw = raw.substring(start, end + 1)
    
    // Nettoyer les caracteres de controle
    raw = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    
    return res.status(200).json(JSON.parse(raw))

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
