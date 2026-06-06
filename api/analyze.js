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
TRES IMPORTANT: Dans les valeurs texte, utilise UNIQUEMENT des lettres, chiffres, espaces, points, virgules et tirets. Interdit: apostrophes, guillemets, accents, caracteres speciaux. Max 80 caracteres par valeur texte.

Regles MPR 2026:
- ITI/ITE non eligibles par geste depuis 01/01/2026 - ajouter alerte_mpr
- Chaudieres biomasse non eligibles par geste - ajouter alerte_mpr
- PAC air/air et hybrides exclues - ajouter alerte_mpr
- conforme=true si valeurs techniques respectent les seuils, conforme=false si inferieures aux seuils, conforme=null si valeurs absentes
- NE PAS mettre conforme=false uniquement parce que ITI/ITE est exclu du parcours par geste

Menuiseries - conforme=true si valeurs respectees:
- Fenetres et portes-fenetres: (Uw<=1.3 ET Sw>=0.3) OU (Uw<=1.7 ET Sw>=0.36)
- Velux fenetres de toiture: Uw<=1.5 ET Sw>=0.36
- Doubles fenetres sur baie existante: Uw<=1.8 ET Sw>=0.36
- Porte entree ou exterieur: Ud<=1.7. conforme=true si Ud<=1.7
- Volets roulants: R>0.22. conforme=true si R>0.22
- Si Uw ou Sw absent: conforme=null

Isolation - conforme=true si R respecte le seuil:
- Combles perdus R>=7. Rampants R>=6. Terrasse R>=6.5. Plancher bas R>=3
- Murs ITI R>=3.7 (alerte non eligible MPR par geste). Murs ITE R>=4.4 (alerte non eligible MPR par geste)

PAC: BT ETAS>=126. MT ETAS>=111. CET COP>=3. PAC air/air et hybrides exclues.
Bois: Flamme Verte 7 etoiles, rendement>=87, poeles ETAS>=111, chaudieres ETAS>=126 non eligibles.

=== TRAVAUX INDUITS - SOURCE GUIDE ANAH JUILLET 2025 ===

TRAVAUX INDUITS ELIGIBLES (communs a tous les postes):
Lis chaque ligne du devis et identifie les postes qui correspondent a ces categories:
- Depose et pose des equipements, produits et ouvrages necessaires aux travaux
- Installation et depose d echafaudages, nacelles, lignes de vie
- Depose mise en decharge des ouvrages, materiaux, equipements anterieurs
- Depose de revetements de sols et facade en cas d isolation thermique
- Pose de revetements pour maintenir ou proteger l isolant (plaques de platre, lambris, faux plafond)
- Raccordement electrique ventilation ou equipement chauffage ou ECS
- Modifications plomberie, reseaux interieurs, platrerie, peintures
- Reprise des appuis, linteaux, tableaux
- Travaux de remise en etat suite a degradation due aux travaux
- Deplace des volets suite a isolation thermique
- Traitement et prevention de l humidite (arases etanches, drainage, vides sanitaires)
- Traitement etancheite a l air (membrane pare-vapeur, frein-vapeur)
- Travaux de ventilation pour renouvellement d air minimal
- Preparation du support (ravalement, decapage, nettoyage, ragréage)
- Dispositifs de fixation et protection de l isolant (chevillage, collage, rail)
- Depose et repose structures solidaires (marquise, auvent, balcon, garde-corps, volets-battants)
- Depose repose evacuation eaux pluviales, gouttieres, zinguerie, ferronnerie
- Travaux de forage et terrassement pour PAC geothermique ou reseau de chaleur
- Equipements de regulation temperature (thermostat, programmateur, robinets thermostatiques)
- Rééquilibrage, desembouage, nettoyage circuit chauffage
- Adaptation systemes evacuation produits combustion (fumisterie, tubage)
- Ramonage, debistrage consecutif a installation equipement

TRAVAUX INDUITS EXCLUS (source guide ANAH juillet 2025 - liste non exhaustive):
Lis chaque ligne du devis et identifie les postes qui correspondent a ces categories EXCLUES:
- Travaux de desamiantage resultant d obligations reglementaires
- Protection chantier, mise en decharge et traitement dechets amianteé
- Creation de cloisons interieures
- Creation d un escalier d acces aux combles
- Pose de revetements sur ensemble des murs (papiers peints, peinture decorative)
- Pose de revetement de sol (carrelage, bois, pvc) sauf plancher chauffant ou isolation plancher interieur
- Creation de nouvelles ouvertures
- Pose de stores interieurs
- Nettoyage ou peinture balcons, loggias, terrasses ou volets (sauf degradation pendant travaux)
- Changement des garde-corps (sauf si necessaire pour isolation)
- Elements decoratifs (carreaux faience decoratifs, banquettes)
- Travaux embellissement et habillage insert
- Production electrique decentralisee (photovoltaique, eolien, pico-hydroelectricite, cogénération)
- Remplacement ou installation tableau electrique (sauf cadre installation equipement chauffage)
- Refection totale installation electrique
- Travaux branchement raccordement electrique au reseau (modification puissance)
- Creation tranchee pour raccordement gaz ou electricite au reseau de chaleur urbain
- Frais remise en etat site (remblais) suite depose cuve citerne fioul gaz
- Extension systeme chauffage dans pieces non chauffees initialement
- Installation adoucisseurs d eau
- Appareils individualisation frais de chauffage
- Installation materiels controle suivi consommations eau electricite (compteurs individuels)

Retourne ce JSON avec les vraies valeurs du document:
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}${isDevis ? ',"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}' : ''},"perf_menuiseries":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_isolation":{"present":false,"conforme":null,"alerte_mpr":"","commentaire":"","details":{"surface_isoler":{"present":false,"valeur":"","commentaire":""},"type_isolant":{"present":false,"valeur":"","commentaire":""},"epaisseur":{"present":false,"valeur":"","commentaire":""},"acermi":{"present":false,"valeur":"","commentaire":""}}},"perf_pac":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_bois":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}},"travaux_induits":{"eligibles":[{"designation":"","montant_ht":0,"commentaire":""}],"exclus":[{"designation":"","montant_ht":0,"raison_exclusion":"","commentaire":""}],"total_induits_eligibles_ht":0,"total_exclus_ht":0,"montant_a_deduire_ht":0,"montant_corrige_ht":0,"commentaire_global":""},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
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
