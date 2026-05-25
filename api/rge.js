// API route: /api/rge?siret=XXXXXXXXXXXXXXX
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { siret } = req.query
  if (!siret) return res.status(400).json({ error: 'SIRET manquant.' })

  // Nettoyer le SIRET (enlever espaces)
  const siretClean = siret.replace(/\s/g, '')

  try {
    // API ADEME RGE - recherche par SIRET
    const url = `https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines?q=${siretClean}&q_fields=siret&size=50`
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } })
    const data = await resp.json()

    if (!data.results || data.results.length === 0) {
      return res.status(200).json({
        found: false,
        siret: siretClean,
        message: 'Entreprise non trouvee dans l annuaire RGE ADEME.',
        certifications: []
      })
    }

    const today = new Date()
    const certifications = data.results.map(r => {
      const dateFinStr = r.date_fin_validite || r.dateFinValidite || r.date_fin || ''
      const dateFin = dateFinStr ? new Date(dateFinStr) : null
      const valide = dateFin ? dateFin >= today : true
      return {
        nom_entreprise: r.nom_entreprise || r.raison_sociale || '',
        siret: r.siret || '',
        adresse: [r.adresse1, r.code_postal, r.ville].filter(Boolean).join(', '),
        domaine: r.domaine || r.domaine_travaux || '',
        sous_domaine: r.sous_domaine || r.sous_domaine_travaux || '',
        qualification: r.qualification || r.intitule_qualification || '',
        organisme: r.organisme || '',
        numero_certificat: r.numero_certificat || r.ref_certificat || '',
        date_debut: r.date_debut_validite || r.date_debut || '',
        date_fin: dateFinStr,
        valide: valide,
        alerte: valide ? '' : `Certificat expire le ${dateFinStr}`
      }
    })

    // Grouper par domaine
    const domainesValides = [...new Set(certifications.filter(c => c.valide).map(c => c.domaine))]
    const domainesExpires = [...new Set(certifications.filter(c => !c.valide).map(c => c.domaine))]

    return res.status(200).json({
      found: true,
      siret: siretClean,
      nom_entreprise: certifications[0]?.nom_entreprise || '',
      adresse: certifications[0]?.adresse || '',
      certifications,
      domaines_valides: domainesValides,
      domaines_expires: domainesExpires,
      nb_certifications: certifications.length,
      nb_valides: certifications.filter(c => c.valide).length
    })

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
