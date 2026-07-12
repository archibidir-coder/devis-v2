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

    const prompt = `Tu es un expert en analyse de ${mode}s de renovation energetique France, specialiste MaPrimeRenov 2026.
Analyse ce document PDF et reponds UNIQUEMENT avec du JSON valide, sans markdown, sans texte avant ou apres.
Dans les valeurs texte: lettres, chiffres, espaces, points, virgules, tirets uniquement. Max 100 caracteres. Pas d apostrophe ni guillemet.

INSTRUCTIONS DE LECTURE:
Lis CHAQUE ligne, paragraphe, pied de page, description produit.
Infos pouvant etre sur une ligne dense ex: SIRET 123 NAF 4321A TVA FR76497804377.
Cherche R dans descriptions: R=3.75, (R=3.75 m2.K/W), resistance thermique 3.75.
Cherche ACERMI: ACERMI N 02/016/156, Certification Acermi 12/081/795.

REGLE DE COMPARAISON:
conforme=true si valeur >= seuil minimum.
conforme=false UNIQUEMENT si valeur < seuil.
conforme=null si valeur absente.

BLOC 1 - ADMINISTRATIF:
siret: SIRET 14 chiffres ou SIREN 9 chiffres.
date_emission: Date emission.
numero_document: Numero du ${mode}.
rcs_rne: Numero RCS ou RNE.
adresse_siege: Adresse complete siege social.
tva_intra: TVA FR + 11 caracteres.
montants: total_ht, total_ttc, taux_tva, remises.${isDevis ? `
date_visite: Date visite technique.
rge: Qualification RGE, numero, organisme, date expiration. conforme=false si expire.
dechets: Mention gestion dechets de chantier.` : ''}

BLOC 2 - ISOLATION (seuils guide MPR 2026):
Pour chaque poste isolation trouve:
- TOITURE TERRASSE: R >= 4.5 m2.K/W (par geste). Eligible MPR par geste.
- RAMPANTS TOITURE ET PLAFONDS COMBLES: R >= 6 m2.K/W. Eligible MPR par geste.
- PLANCHER COMBLES PERDUS: R >= 7 m2.K/W. Eligible MPR par geste.
- MURS ITI: R >= 3.7 m2.K/W. alerte_mpr=ITI exclu MPR par geste 2026 eligible renovation ampleur.
- MURS ITE: R >= 4.4 m2.K/W. alerte_mpr=ITE exclu MPR par geste 2026 eligible renovation ampleur.
- PLANCHER BAS: R >= 3 m2.K/W. Eligible MPR par geste.
Verifier aussi: surface m2, type isolant, epaisseur mm, numero ACERMI.

BLOC 3 - MENUISERIES (seuils guide MPR 2026):
Verifier Uw ET Sw ensemble.
- FENETRE OU PORTE-FENETRE: (Uw<=1.3 ET Sw>=0.3) OU (Uw<=1.7 ET Sw>=0.36). Eligible MPR remplacement simple vitrage.
- FENETRE TOITURE VELUX: Uw<=1.5 ET Sw<=0.36 (Sw doit etre inferieur ou egal). Eligible MPR.
- DOUBLE FENETRE: Uw<=1.8 ET Sw>=0.32. Eligible MPR.
- PORTE ENTREE: Ud<=1.7 W/m2.K. Eligible MPR.
- VOLET ISOLANT: R>0.22 m2.K/W strictement superieur. Eligible MPR.
Si valeurs absentes: conforme=null + commentaire valeur manquante obligatoire MPR.

BLOC 4 - CHAUFFAGE ET ECS (seuils guide MPR 2026):
- PAC AIR/EAU BASSE TEMPERATURE 35C: ETAS>=126%. Eligible MPR par geste.
- PAC AIR/EAU MOYENNE HAUTE TEMPERATURE 55C: ETAS>=111%. Eligible MPR par geste.
- PAC GEOTHERMIQUE eau/eau sol/eau: ETAS>=126%. Eligible MPR par geste.
- PAC AIR/AIR: NON eligible MPR par geste. alerte_mpr=PAC air/air non eligible MPR par geste eligible CEE si COP saisonnier>=3.9.
- CHAUFFE-EAU THERMODYNAMIQUE CET: ETAS>=95% profil M, >=100% profil L, >=110% profil XL. Eligible MPR.
- POELE INSERT BUCHES manuel: ETAS>=65%. Label Flamme Verte 7 etoiles obligatoire. Eligible MPR.
- POELE INSERT GRANULES automatique: ETAS>=79%. Label Flamme Verte 7 etoiles obligatoire. Eligible MPR.
- CHAUDIERE BOIS BIOMASSE: NON eligible MPR par geste. alerte_mpr=Chaudiere biomasse non eligible MPR par geste eligible CEE. ETAS>77% si <=20kW, >79% si >20kW.

BLOC 5 - VMC DOUBLE FLUX:
Installation individuelle: classe energetique A minimum, echangeur efficacite>85%, certifie NF 205.
Installation collective: echangeur rendement>=75%, certifie Eurovent AAHE ou AARE.
Eligible MPR uniquement avec isolation concomitante.

BLOC 6 - TRAVAUX INDUITS (guide ANAH juillet 2025):
Classer chaque ligne du devis en eligible, exclu ou remise.
ELIGIBLE: echafaudage, depose repose equipements, preparation chantier, raccordement electrique chauffage ou ventilation, modifications plomberie reseaux interieurs platrerie peintures consecutifs aux travaux, traitement humidite, membrane pare-vapeur, fixation isolant, depose repose gouttieres structures solidaires, ravalement facade apres ITE, fumisterie tubage ramonage, thermostat programmateur robinets thermostatiques, reequilibrage desembouage nettoyage circuit, remplacement radiateurs lies au nouvel equipement, chape beton plancher chauffant, ballon tampon.
EXCLU (priorite absolue): cloisons interieures (toute cloison quelle que soit composition), habillage WC baignoire coffrage caisson, BA13 hydro marine en amenagement pieces humides, revetements decoratifs murs, pose sol sauf plancher chauffant ou isolation plancher interieur, creation nouvelles ouvertures, escalier acces combles, stores interieurs, nettoyage peinture balcons loggias volets sauf degradation, garde-corps sauf necessaire pour isolation, elements decoratifs, embellissement habillage insert, photovoltaique eolien cogénération, tableau electrique sauf installation chauffage ECS, refection totale installation electrique, branchement reseau electrique, tranchee gaz electricite, remblais suite depose cuve, extension chauffage pieces non chauffees, adoucisseurs eau, compteurs individuels, desamiantage reglementaire.
REMISE: toute ligne negative deja deduite du total, ne pas retraiter.

Retourne ce JSON:
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"total_ht":0,"total_ttc":0,"taux_tva":[],"remises":[],"alerte_tva_multiple":false,"commentaire_tva":""}}${isDevis ? `,"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}` : ''},"postes_isolation":{"present":false,"postes":[{"type_poste":"","libelle_devis":"","r_valeur":"","r_seuil":"","r_conforme":null,"surface_m2":"","type_isolant":"","epaisseur_mm":"","acermi":"","alerte_mpr":"","commentaire":""}]},"postes_menuiseries":{"present":false,"produits":[{"type_poste":"","libelle_devis":"","uw":"","sw":"","ud":"","r_volet":"","conforme":null,"alerte_mpr":"","commentaire":""}]},"postes_chauffage":{"present":false,"equipements":[{"type_poste":"","libelle_devis":"","marque_reference":"","puissance_kw":"","etas_valeur":"","etas_seuil":"","etas_conforme":null,"flamme_verte_present":false,"flamme_verte_valeur":"","profil_soutirage":"","alerte_mpr":"","commentaire":""}]},"poste_vmc":{"present":false,"type_installation":"","classe_caisson":"","efficacite_echangeur":"","certification":"","conforme":null,"alerte_mpr":"","commentaire":""}},"travaux_induits":{"eligibles":[{"designation":"","montant_ht":0,"commentaire":""}],"exclus":[{"designation":"","montant_ht":0,"raison_exclusion":""}],"remises":[{"designation":"","montant_ht":0}],"total_exclus_ht":0,"montant_corrige_ht":0},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
              { type: 'text', text: prompt }
            ]
          },
          { role: 'assistant', content: '{' }
        ]
      })
    })

    const responseText = await response.text()
    let data
    try {
      data = JSON.parse(responseText)
    } catch(e) {
      return res.status(500).json({ error: 'Erreur Anthropic: ' + responseText.substring(0, 300) })
    }

    if (data.error) return res.status(500).json({ error: data.error.message || JSON.stringify(data.error) })
    if (!data.content || !data.content.length) return res.status(500).json({ error: 'Reponse vide. Reessayez.' })

    let raw = '{' + data.content.map(b => b.text || '').join('')
    raw = raw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ')
    raw = raw.replace(/\n|\r|\t/g, ' ')

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(500).json({ error: 'JSON invalide. Reessayez.' })
    raw = raw.substring(start, end + 1)

    try {
      return res.status(200).json(JSON.parse(raw))
    } catch(parseErr) {
      const pos = parseInt(parseErr.message.match(/position (\d+)/)?.[1] || '0')
      return res.status(500).json({
        error: parseErr.message,
        debug: raw.substring(Math.max(0, pos - 100), pos + 100)
      })
    }

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
