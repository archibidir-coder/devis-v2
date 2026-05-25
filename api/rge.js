module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const { siret } = req.query
  if (!siret) return res.status(400).json({ error: 'SIRET manquant.' })

  const siretClean = siret.replace(/\s/g, '')

  try {
    // API publique ADEME - URL correcte 2026
    const url = `https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines?qs=siret%3A${siretClean}&size=50&select=nom_entreprise,siret,adresse1,code_postal,ville,domaine,sous_domaine,qualification,organisme,numero_certificat,date_debut_validite,date_fin_validite,archive`

    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'devis-agent-mpr/1.0'
      }
    })

    // Vérifier que c'est bien du JSON
    const contentType = resp.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      // Fallback: essayer avec l'autre paramètre de recherche
      const url2 = `https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines?q=${siretClean}&size=50`
      const resp2 = await fetch(url2, { headers: { 'Accept': 'application/json' } })
      const ct2 = resp2.headers.get('content-type') || ''
      if (!ct2.includes('application/json')) {
        return res.status(200).json({
          found: false,
          siret: siretClean,
          message: 'API ADEME temporairement indisponible.',
          fallback_url: `https://france-renov.gouv.fr/annuaires-professionnels/artisan-rge-architecte#/tab`,
          certifications: []
        })
      }
      const data2 = await resp2.json()
      return res.status(200).json(processRGE(siretClean, data2))
    }

    const data = await resp.json()
    return res.status(200).json(processRGE(siretClean, data))

  } catch (e) {
    // En cas d'erreur, retourner un résultat dégradé avec lien manuel
    return res.status(200).json({
      found: false,
      siret: siretClean,
      message: 'Verification automatique impossible: ' + e.message,
      fallback_url: `https://france-renov.gouv.fr/annuaires-professionnels/artisan-rge-architecte#/tab`,
      certifications: []
    })
  }
}

function processRGE(siretClean, data) {
  if (!data.results || data.results.length === 0) {
    return {
      found: false,
      siret: siretClean,
      message: 'Entreprise non trouvee dans l annuaire RGE ADEME.',
      fallback_url: `https://france-renov.gouv.fr/annuaires-professionnels/artisan-rge-architecte#/tab`,
      certifications: []
    }
  }

  const today = new Date()
  const certifications = data.results
    .filter(r => !r.archive || r.archive === false || r.archive === 'false')
    .map(r => {
      const dateFinStr = r.date_fin_validite || ''
      const dateFin = dateFinStr ? new Date(dateFinStr) : null
      const valide = dateFin ? dateFin >= today : true
      return {
        nom_entreprise: r.nom_entreprise || '',
        siret: r.siret || '',
        adresse: [r.adresse1, r.code_postal, r.ville].filter(Boolean).join(', '),
        domaine: r.domaine || '',
        sous_domaine: r.sous_domaine || '',
        qualification: r.qualification || '',
        organisme: r.organisme || '',
        numero_certificat: r.numero_certificat || '',
        date_debut: r.date_debut_validite || '',
        date_fin: dateFinStr,
        valide,
        alerte: valide ? '' : `Certificat expire le ${dateFinStr}`
      }
    })

  const domainesValides = [...new Set(certifications.filter(c => c.valide).map(c => c.domaine))]
  const domainesExpires = [...new Set(certifications.filter(c => !c.valide).map(c => c.domaine))]

  return {
    found: true,
    siret: siretClean,
    nom_entreprise: certifications[0]?.nom_entreprise || '',
    adresse: certifications[0]?.adresse || '',
    certifications,
    domaines_valides: domainesValides,
    domaines_expires: domainesExpires,
    nb_certifications: certifications.length,
    nb_valides: certifications.filter(c => c.valide).length,
    fallback_url: `https://france-renov.gouv.fr/annuaires-professionnels/artisan-rge-architecte#/tab`
  }
}
