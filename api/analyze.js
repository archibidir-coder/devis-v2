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

    const prompt = `Tu es un expert en analyse de ${mode}s de rénovation énergétique France, spécialiste MaPrimeRénov 2026.

Analyse ce PDF et réponds avec un JSON strictement valide.

RÈGLES MPR 2026 : ITI/ITE non éligibles par geste. Chaudières biomasse non éligibles. PAC air/air et hybrides exclues.
MENUISERIES : Fenêtres Uw<=1.3 Sw>=0.3 OU Uw<=1.7 Sw>=0.36. Velux Uw<=1.5 Sw>=0.36. Doubles fenêtres Uw<=1.8 Sw>=0.36. Porte Ud<=1.7. Volets R>0.22.
ISOLATION : Combles R>=7. Rampants R>=6. Terrasse R>=6.5. Plancher R>=3. ITI R>=3.7. ITE R>=4.4.
PAC : BT ETAS>=126. MT ETAS>=111. CET COP>=3.
BOIS : Flamme Verte 7 etoiles rendement>=87 poeles ETAS>=111 chaudieres ETAS>=126.

IMPORTANT : Dans tes valeurs texte, utilise uniquement des caractères simples. Evite les guillemets, apostrophes, accents problematiques dans les valeurs JSON. Remplace les apostrophes par des espaces.

Retourne ce JSON complété avec les vraies valeurs du document :

{
  "type_document": "${mode}",
  "checks": {
    "siret": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "date_emission": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "numero_document": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "rcs_rne": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "adresse_siege": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "tva_intra": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "montants": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" }${isDevis ? `,
    "date_visite": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "rge": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "dechets": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" }` : ''},
    "perf_menuiseries": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "perf_isolation": {
      "present": false, "conforme": null, "alerte_mpr": "", "commentaire": "",
      "details": {
        "surface_isoler": { "present": false, "valeur": "", "commentaire": "" },
        "type_isolant": { "present": false, "valeur": "", "commentaire": "" },
        "epaisseur": { "present": false, "valeur": "", "commentaire": "" },
        "acermi": { "present": false, "valeur": "", "commentaire": "" }
      }
    },
    "perf_pac": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" },
    "perf_bois": { "present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": "" }
  },
  "score": 0,
  "total": 0,
  "verdict": "incomplet",
  "remarque_globale": ""
}`

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
    raw = raw.replace(/```json/g, '').replace(/```/g, '').trim()

    // Nettoyer les caractères problématiques
    raw = raw.replace(/[\u0000-\u001F\u007F]/g, ' ')

    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'Reponse invalide. Reessayez.' })

    try {
      return res.status(200).json(JSON.parse(match[0]))
    } catch(parseErr) {
      // Tentative de réparation JSON basique
      let fixed = match[0]
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3')
      return res.status(200).json(JSON.parse(fixed))
    }

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
