module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Clé API Gemini manquante.' })

  try {
    const { pdfBase64, mode } = req.body
    if (!pdfBase64 || !mode) return res.status(400).json({ error: 'Paramètres manquants.' })

    const isDevis = mode === 'devis'

    const prompt = `Tu es un expert en analyse de ${mode}s de travaux de rénovation énergétique en France, spécialiste MaPrimeRénov 2026.

Analyse le document PDF joint et retourne UNIQUEMENT un objet JSON valide, sans aucun texte avant ou après, sans markdown, sans backticks.

Règles MPR 2026 : Murs ITI/ITE non éligibles par geste. Chaudières biomasse non éligibles. PAC air/air et hybrides exclues.

Seuils menuiseries : Fenêtres Uw<=1.3+Sw>=0.3 OU Uw<=1.7+Sw>=0.36. Velux Uw<=1.5+Sw>=0.36. Doubles fenêtres Uw<=1.8+Sw>=0.36. Porte Ud<=1.7. Volets R>0.22.
Seuils isolation : Combles R>=7. Rampants R>=6. Terrasse R>=6.5. Plancher R>=3. ITI R>=3.7. ITE R>=4.4.
Seuils PAC : BT ETAS>=126%. MT ETAS>=111%. CET COP>=3.
Seuils bois : Flamme Verte 7 etoiles, rendement>=87%, poeles ETAS>=111%, chaudieres ETAS>=126%.

Retourne ce JSON en remplacant les valeurs par ce que tu trouves dans le document :
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"date_emission":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"numero_document":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"rcs_rne":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"adresse_siege":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"tva_intra":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"montants":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""}${isDevis ? ',"date_visite":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"rge":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"dechets":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""}' : ''},"perf_menuiseries":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"perf_isolation":{"present":false,"conforme":null,"alerte_mpr":null,"commentaire":"","details":{"surface_isoler":{"present":false,"valeur":null,"commentaire":""},"type_isolant":{"present":false,"valeur":null,"commentaire":""},"epaisseur":{"present":false,"valeur":null,"commentaire":""},"acermi":{"present":false,"valeur":null,"commentaire":""}}},"perf_pac":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""},"perf_bois":{"present":false,"valeur":null,"conforme":null,"alerte_mpr":null,"commentaire":""}},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
            { text: prompt }
          ]}],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 4000,
            responseMimeType: 'application/json'
          }
        })
      }
    )

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    // Nettoyer le JSON
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim()
    // Extraire le JSON si entouré de texte
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'Réponse invalide du modèle. Réessayez.' })

    return res.status(200).json(JSON.parse(match[0]))
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
