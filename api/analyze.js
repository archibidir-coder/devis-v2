module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'Cle API manquante.' })

  try {
    const { pdfBase64, mode } = req.body
    if (!pdfBase64 || !mode) return res.status(400).json({ error: 'Parametres manquants.' })

    const isDevis = mode === 'devis'

    const prompt = `Analyse ce ${mode} de renovation energetique francais.
Reponds UNIQUEMENT avec du JSON valide, sans markdown, sans texte avant ou apres.
Utilise uniquement des caracteres ASCII dans les valeurs (pas d apostrophe, pas de guillemets dans les valeurs).
Limite chaque valeur texte a 60 caracteres maximum.

Regles MPR 2026:
- ITI/ITE non eligibles par geste depuis 01/01/2026
- Chaudieres biomasse non eligibles par geste
- PAC air/air et hybrides exclues
- Fenetres: Uw<=1.3+Sw>=0.3 OU Uw<=1.7+Sw>=0.36
- Velux: Uw<=1.5+Sw>=0.36
- Doubles fenetres: Uw<=1.8+Sw>=0.36
- Porte: Ud<=1.7
- Volets: R>0.22
- Combles: R>=7, Rampants: R>=6, Terrasse: R>=6.5
- Plancher: R>=3, ITI: R>=3.7, ITE: R>=4.4
- PAC BT: ETAS>=126, PAC MT: ETAS>=111, CET: COP>=3
- Bois: Flamme Verte 7 etoiles, rendement>=87

Retourne ce JSON avec les vraies valeurs:
{
  "type_document": "${mode}",
  "checks": {
    "siret": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "date_emission": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "numero_document": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "rcs_rne": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "adresse_siege": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "tva_intra": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "montants": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""}${isDevis ? `,
    "date_visite": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "rge": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "dechets": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""}` : ''},
    "perf_menuiseries": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "perf_isolation": {
      "present": false, "conforme": null, "alerte_mpr": "", "commentaire": "",
      "details": {
        "surface_isoler": {"present": false, "valeur": "", "commentaire": ""},
        "type_isolant": {"present": false, "valeur": "", "commentaire": ""},
        "epaisseur": {"present": false, "valeur": "", "commentaire": ""},
        "acermi": {"present": false, "valeur": "", "commentaire": ""}
      }
    },
    "perf_pac": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""},
    "perf_bois": {"present": false, "valeur": "", "conforme": null, "alerte_mpr": "", "commentaire": ""}
  },
  "score": 0,
  "total": 0,
  "verdict": "incomplet",
  "remarque_globale": ""
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
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: prompt }
            ]
          },
          {
            role: 'assistant',
            content: '{'
          }
        ]
      })
    })

    const data = await response.json()
    if (data.error) return res.status(500).json({ error: data.error.message })

    let raw = '{' + data.content.map(b => b.text || '').join('')
    raw = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

    const end = raw.lastIndexOf('}')
    if (end === -1) return res.status(500).json({ error: 'Reponse invalide.' })
    raw = raw.substring(0, end + 1)

    return res.status(200).json(JSON.parse(raw))

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
