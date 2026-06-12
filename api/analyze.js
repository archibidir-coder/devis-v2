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

INSTRUCTIONS DE LECTURE DU DOCUMENT - TRES IMPORTANT:
- Lis CHAQUE ligne et CHAQUE paragraphe du document y compris pieds de page, en-tetes, mentions legales, lignes denses, descriptions de produits
- Les informations peuvent etre sur une seule ligne dense avec tirets ou separateurs ex: "SIRET: 123 - NAF: 4321A - TVA Intracommunautaire: FR76497804377"
- Pour la TVA intracommunautaire: cherche "FR" suivi de 11 caracteres dans TOUT le document, peut etre ecrit "TVA Intracommunautaire", "TVA intracom", "N TVA", "TVA FR"
- Pour le SIRET: 14 chiffres consecutifs, peut etre avec espaces ex "497 804 377 00024"
- Pour le RCS/RNE: cherche "RCS", "RNE", "Registre du commerce" suivi d une ville et d un numero
- Pour l assurance decennale: cherche numero de police, nom assureur, meme dans les mentions legales en bas de page
- Ne pas sauter une information parce qu elle est sur la meme ligne que d autres informations

INSTRUCTIONS SPECIFIQUES POUR LES VALEURS TECHNIQUES D ISOLATION:
- La valeur R peut etre ecrite de multiples facons: "R=3.75", "R = 3,75", "R: 3.75", "resistance thermique 3.75", "Rth=3.75", "(R=3.75 m2.K/W)", "R 3.75 m2K/W"
- Cherche la valeur R dans les descriptions de produits, pas seulement dans des champs dedies
- Le numero ACERMI peut etre ecrit: "ACERMI N 02/016/156", "ACERMI N°02/016/156", "Certification Acermi 02/016/156", "cert. ACERMI: 02/016/156" - le symbole degre ou numero est variable
- L epaisseur peut etre ecrite: "120 mm", "120mm", "epaisseur 120", "ep. 120", "en 120 mm d epaisseur"
- La marque et reference du produit sont souvent dans la description: "marque KNAUF reference TP238", "KNAUF TP238", "isolant KNAUF"
- Le type d isolant peut etre: "doublage placostil", "laine de verre", "laine de roche", "PSE", "polyurethane", "ouate de cellulose"
- Meme si les infos sont dans un long paragraphe de description, extraire chaque valeur separement
- Exemple de description a parser: "Doublage placostil avec isolation de marque KNAUF reference TP238 en 120 mm d epaisseur (R=3.75 m2.K/W) ACERMI N 02/016/156" -> type=doublage placostil KNAUF TP238, epaisseur=120mm, R=3.75, ACERMI=02/016/156

REGLES DE COMPARAISON - ABSOLUMENT CRITIQUE:
conforme=true si la valeur du devis est SUPERIEURE OU EGALE au seuil minimum.
conforme=false UNIQUEMENT si la valeur est STRICTEMENT INFERIEURE au seuil.
conforme=null si la valeur est ABSENTE du devis.
EXEMPLES CORRECTS:
- Seuil R>=4.4 et devis R=4.5 -> conforme=true (4.5 >= 4.4 OK)
- Seuil R>=3.7 et devis R=3.75 -> conforme=true (3.75 >= 3.7 OK)
- Seuil R>=7 et devis R=7.5 -> conforme=true (7.5 >= 7 OK)
- Seuil Uw<=1.3 et devis Uw=1.2 -> conforme=true (1.2 <= 1.3 OK)
- Seuil Ud<=1.7 et devis Ud=1.0 -> conforme=true (1.0 <= 1.7 OK)
- Seuil ETAS>=126 et devis ETAS=130 -> conforme=true (130 >= 126 OK)
- Seuil COP>=3 et devis COP=3.5 -> conforme=true (3.5 >= 3 OK)
- Seuil rendement>=87 et devis rendement=90 -> conforme=true (90 >= 87 OK)
- Seuil R>=4.4 et devis R=4.2 -> conforme=false (4.2 < 4.4 NON)
NE JAMAIS mettre conforme=false si la valeur respecte ou depasse le seuil.
NE JAMAIS mettre conforme=false uniquement parce que ITI/ITE est exclu MPR par geste.

Regles MPR 2026 eligibilite:
- ITI/ITE non eligibles par geste depuis 01/01/2026 -> ajouter alerte_mpr MAIS conforme selon valeur R
- Chaudieres biomasse non eligibles par geste -> ajouter alerte_mpr MAIS conforme selon rendement/ETAS
- PAC air/air et hybrides exclues -> ajouter alerte_mpr

Menuiseries - seuils techniques:
- Fenetres et portes-fenetres: conforme=true si (Uw<=1.3 ET Sw>=0.3) OU (Uw<=1.7 ET Sw>=0.36). Ex: Uw=1.3 Sw=0.32 -> conforme=true
- Velux fenetres de toiture: conforme=true si Uw<=1.5 ET Sw>=0.36. Ex: Uw=1.4 -> conforme=true
- Doubles fenetres sur baie existante: conforme=true si Uw<=1.8 ET Sw>=0.36
- Porte entree ou exterieur: conforme=true si Ud<=1.7. Ex: Ud=1.0 -> conforme=true. Ex: Ud=1.7 -> conforme=true
- Volets roulants: conforme=true si R>=0.22. Ex: R=0.25 -> conforme=true
- Si Uw, Sw, Ud ou R absent du devis: conforme=null + commentaire valeur manquante

Isolation - seuils techniques (conforme=true si R >= seuil):
- Combles perdus: seuil R>=7. Ex: R=7.5 -> conforme=true
- Rampants de toiture: seuil R>=6. Ex: R=6.5 -> conforme=true
- Toiture terrasse: seuil R>=6.5. Ex: R=7 -> conforme=true
- Plancher bas: seuil R>=3. Ex: R=3.5 -> conforme=true
- Murs ITI: seuil R>=3.7. Ex: R=3.75 -> conforme=true. Ex: R=4.0 -> conforme=true. Ajouter alerte_mpr non eligible par geste.
- Murs ITE: seuil R>=4.4. Ex: R=4.5 -> conforme=true. Ex: R=5.0 -> conforme=true. Ajouter alerte_mpr non eligible par geste.

PAC et CET - verifier OBLIGATOIREMENT chaque valeur ligne par ligne:
- PAC air/eau basse temperature (35C): ETAS>=126 ET SCOP>=3.9. Si ETAS absent: conforme=null + commentaire ETAS manquant obligatoire MPR. Si SCOP absent: signaler SCOP manquant.
- PAC air/eau moyenne temperature (55C): ETAS>=111 ET SCOP>=3.5. Memes regles si absent.
- PAC geothermique eau/eau: ETAS>=126. Signaler si absent.
- CET chauffe-eau thermodynamique: COP>=3 selon EN 16147. Si COP absent: conforme=null + commentaire COP manquant obligatoire MPR.
- PAC air/air: EXCLUE MPR 2026 - alerte_mpr obligatoire.
- PAC hybride PAC+chaudiere gaz: EXCLUE MPR 2026 - alerte_mpr obligatoire.
- Taux couverture PAC si appoint present: >=70%. Signaler si absent.
- ETAS doit etre mentionne sur le devis/facture - si absent signaler comme manquant obligatoire.

Chauffage bois - verifier OBLIGATOIREMENT chaque valeur:
- Poeles a buches et inserts: label Flamme Verte 7 etoiles OBLIGATOIRE. Rendement>=87%. ETAS>=111%. Si une valeur absente: conforme=null + commentaire valeur manquante obligatoire MPR.
- Poeles a granules: label Flamme Verte 7 etoiles OBLIGATOIRE. Rendement>=87%. ETAS>=111%. Memes regles.
- Chaudieres biomasse: rendement>=87%, ETAS>=126% - NON ELIGIBLES MPR par geste 2026 - alerte_mpr obligatoire.
- Si label Flamme Verte absent: conforme=false + commentaire label manquant obligatoire.
- Si rendement absent: conforme=null + commentaire rendement manquant obligatoire MPR.
- Si ETAS absent: conforme=null + commentaire ETAS manquant obligatoire MPR.

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
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}${isDevis ? ',"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}' : ''},"perf_menuiseries":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_isolation":{"present":false,"conforme":null,"alerte_mpr":"","commentaire":"","details":{"surface_isoler":{"present":false,"valeur":"","commentaire":""},"type_isolant":{"present":false,"valeur":"","commentaire":""},"epaisseur":{"present":false,"valeur":"","commentaire":""},"acermi":{"present":false,"valeur":"","commentaire":""}}},"perf_pac":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"type_pac":"","etas":{"present":false,"valeur":"","conforme":null,"commentaire":""},"scop":{"present":false,"valeur":"","conforme":null,"commentaire":""},"cop":{"present":false,"valeur":"","conforme":null,"commentaire":""},"taux_couverture":{"present":false,"valeur":"","commentaire":""}}},"perf_bois":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"type_equipement":"","flamme_verte":{"present":false,"valeur":"","conforme":null,"commentaire":""},"rendement":{"present":false,"valeur":"","conforme":null,"commentaire":""},"etas":{"present":false,"valeur":"","conforme":null,"commentaire":""}}}},"travaux_induits":{"eligibles":[{"designation":"","montant_ht":0,"commentaire":""}],"exclus":[{"designation":"","montant_ht":0,"raison_exclusion":"","commentaire":""}],"total_induits_eligibles_ht":0,"total_exclus_ht":0,"montant_a_deduire_ht":0,"montant_corrige_ht":0,"commentaire_global":""},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

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
