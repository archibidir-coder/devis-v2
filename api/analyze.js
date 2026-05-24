module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Clé API Anthropic manquante dans les variables Vercel.' })

  try {
    const { pdfBase64, mode } = req.body
    if (!pdfBase64 || !mode) return res.status(400).json({ error: 'Paramètres manquants.' })

    const isDevis = mode === 'devis'
    const prompt = `Tu es un expert en analyse de ${mode}s de travaux de rénovation énergétique en France, spécialiste MaPrimeRénov' 2026.

RÈGLES MPR PAR GESTE 2026 :
- Murs ITI/ITE : NON ÉLIGIBLE par geste depuis 01/01/2026
- Chaudières biomasse : NON ÉLIGIBLES par geste depuis 01/01/2026
- PAC air/air et hybrides : EXCLUES Coup de pouce Chauffage depuis 01/01/2026

Vérifie ces éléments :
ADMINISTRATIF: siret, date_emission, numero_document, rcs_rne, adresse_siege, tva_intra, montants${isDevis ? ', date_visite, rge, dechets' : ''}
MENUISERIES: Fenêtres (Uw≤1,3+Sw≥0,3 OU Uw≤1,7+Sw≥0,36), Velux (Uw≤1,5+Sw≥0,36), Doubles fenêtres (Uw≤1,8+Sw≥0,36), Porte (Ud≤1,7), Volets (R>0,22)
ISOLATION: Combles R≥7, Rampants R≥6, Terrasse R≥6.5, Plancher R≥3, ITI R≥3.7 (non éligible), ITE R≥4.4 (non éligible) + surface, type isolant, épaisseur, ACERMI
PAC/CET: PAC BT ETAS≥126%, PAC MT ETAS≥111%, CET COP≥3
BOIS: Flamme Verte 7★, rendement≥87%, poêles ETAS≥111%, chaudières ETAS≥126% (non éligible)

Réponds UNIQUEMENT en JSON valide sans markdown :
{
  "type_document": "${mode}",
  "checks": {
    "siret": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": null, "commentaire": "..."},
    "date_emission": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "numero_document": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "rcs_rne": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "adresse_siege": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "tva_intra": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "montants": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."}${isDevis ? `,
    "date_visite": {"present": bool, "valeur": "...", "conforme": null, "alerte_mpr": null, "commentaire": "..."},
    "rge": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": null, "commentaire": "..."},
    "dechets": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": null, "commentaire": "..."}` : ''},
    "perf_menuiseries": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": null, "commentaire": "..."},
    "perf_isolation": {
      "present": bool, "conforme": bool|null, "alerte_mpr": "texte si ITI/ITE sinon null", "commentaire": "...",
      "details": {
        "surface_isoler": {"present": bool, "valeur": "...", "commentaire": "..."},
        "type_isolant": {"present": bool, "valeur": "...", "commentaire": "..."},
        "epaisseur": {"present": bool, "valeur": "...", "commentaire": "..."},
        "acermi": {"present": bool, "valeur": "...", "commentaire": "..."}
      }
    },
    "perf_pac": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": "texte si PAC air/air ou hybride sinon null", "commentaire": "..."},
    "perf_bois": {"present": bool, "valeur": "...", "conforme": bool|null, "alerte_mpr": "texte si chaudière biomasse sinon null", "commentaire": "..."}
  },
  "score": 0,
  "total": 0,
  "verdict": "conforme|incomplet|non conforme",
  "remarque_globale": "..."
}`

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
    const raw = data.content.map(b => b.text || '').join('')
    const clean = raw.replace(/```json|```/g, '').trim()
    return res.status(200).json(JSON.parse(clean))
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
