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

=== INSTRUCTIONS DE LECTURE ===
Lis CHAQUE ligne, paragraphe, pied de page, description produit du document.
Infos pouvant etre sur une ligne dense ex: "SIRET: 123 - TVA: FR76497804377".
Cherche R dans descriptions: "R=3.75", "(R=3.75 m2.K/W)", "resistance thermique 3.75".
Cherche ACERMI: "ACERMI N 02/016/156", "Certification Acermi 12/081/795".
Cherche epaisseur: "120 mm", "120mm", "en 120 mm d epaisseur".

=== REGLE DE COMPARAISON ABSOLUE ===
conforme=true si valeur >= seuil minimum (SUPERIEURE OU EGALE).
conforme=false UNIQUEMENT si valeur STRICTEMENT INFERIEURE au seuil.
conforme=null si valeur ABSENTE.
Exemples corrects: R=4.5 seuil R>=4.4 -> conforme=true. Uw=1.3 seuil Uw<=1.3 -> conforme=true. ETAS=130 seuil ETAS>=126 -> conforme=true.

=== BLOC 1 - ELEMENTS ADMINISTRATIFS ===
siret: SIRET 14 chiffres ou SIREN 9 chiffres, chercher partout.
date_emission: Date emission du ${mode}.
numero_document: Numero du ${mode}.
rcs_rne: Numero RCS ou RNE.
adresse_siege: Adresse complete siege social.
tva_intra: TVA FR + 11 caracteres, chercher partout dans document.
montants: total_ht final, total_ttc, taux_tva utilises, remises. Si plusieurs taux TVA differents: alerte_mpr="Plusieurs taux TVA - verifier coherence".${isDevis ? `
date_visite: Date visite technique ou prealable.
rge: Qualification RGE (numero, organisme, date expiration). conforme=true si valide, conforme=false si expire avec alerte_mpr="RGE expire - non eligible MPR".
dechets: Mention gestion dechets de chantier.` : ''}

=== BLOC 2 - ISOLATION THERMIQUE PAR POSTE ===
Pour chaque poste isolation trouve, verifier R, surface, type isolant, epaisseur, ACERMI.
Identifier le type exact et appliquer le seuil correspondant.

POSTE: TOITURE TERRASSE
Seuil MPR par geste: R >= 4.5 m2.K/W. Source: guide MPR 2026 page 49.
Seuil renovation ampleur: R >= 6.5 m2.K/W.
Eligible MPR par geste 2026.
alerte_mpr si R >= 4.5 mais < 6.5: "Conforme MPR par geste (R>=4.5) mais insuffisant renovation ampleur (R>=6.5)".

POSTE: RAMPANTS DE TOITURE ET PLAFONDS DE COMBLES
Seuil: R >= 6 m2.K/W. Source: guide MPR 2026 page 49.
Eligible MPR par geste 2026.

POSTE: PLANCHER DE COMBLES PERDUS
Seuil: R >= 7 m2.K/W. Source: guide MPR 2026 page 50.
Eligible MPR par geste 2026.

POSTE: MURS EN FACADE OU EN PIGNON - ISOLATION PAR INTERIEUR (ITI)
Seuil: R >= 3.7 m2.K/W. Source: guide MPR 2026 page 50.
ALERTE OBLIGATOIRE: alerte_mpr="ITI exclu MPR par geste depuis 01/01/2026 - eligible renovation ampleur uniquement".
conforme selon valeur R independamment de l alerte MPR.

POSTE: MURS EN FACADE OU EN PIGNON - ISOLATION PAR EXTERIEUR (ITE)
Seuil: R >= 4.4 m2.K/W. Source: guide MPR 2026 page 55 renovation ampleur.
ALERTE OBLIGATOIRE: alerte_mpr="ITE exclu MPR par geste depuis 01/01/2026 - eligible renovation ampleur uniquement".
conforme selon valeur R independamment de l alerte MPR.

POSTE: PLANCHER BAS SUR SOUS-SOL VIDE SANITAIRE OU TERRE-PLEIN
Seuil: R >= 3 m2.K/W. Source: guide MPR 2026 page 50.
Eligible MPR par geste 2026.

=== BLOC 3 - MENUISERIES PAR POSTE ===
Verifier Uw ET Sw ensemble pour chaque produit, jamais Uw seul.

POSTE: FENETRE OU PORTE-FENETRE
Seuil: (Uw <= 1.3 ET Sw >= 0.3) OU (Uw <= 1.7 ET Sw >= 0.36). Source: guide MPR 2026 page 49.
Condition MPR par geste: remplacement simple vitrage uniquement.
conforme=true si une des deux combinaisons respectee.
conforme=null si Uw ou Sw absent avec commentaire "Uw et/ou Sw manquants - obligatoires MPR".
Eligible MPR par geste 2026.

POSTE: FENETRE DE TOITURE (VELUX)
Seuil: Uw <= 1.5 ET Sw <= 0.36 (ATTENTION: Sw doit etre INFERIEUR OU EGAL a 0.36). Source: guide MPR 2026 page 49.
conforme=true si Uw <= 1.5 ET Sw <= 0.36.
conforme=null si Uw ou Sw absent.
Eligible MPR par geste 2026.

POSTE: DOUBLES FENETRES (POSE SUR BAIE EXISTANTE D UNE SECONDE FENETRE A DOUBLE VITRAGE RENFORCE)
Seuil: Uw <= 1.8 ET Sw >= 0.32. Source: guide MPR 2026 page 49.
conforme=true si Uw <= 1.8 ET Sw >= 0.32.
conforme=null si Uw ou Sw absent.
Eligible MPR par geste 2026.

POSTE: PORTE D ENTREE DONNANT SUR EXTERIEUR
Seuil: Ud <= 1.7 W/m2.K. Source: guide MPR 2026 page 50 - criteres CEE uniquement.
conforme=true si Ud <= 1.7.
conforme=null si Ud absent.
alerte_mpr="Porte entree: criteres techniques s appliquent pour CEE - verifier eligibilite MPR".
Eligible MPR par geste 2026.

POSTE: VOLET ISOLANT CARACTERISE PAR RESISTANCE THERMIQUE - VOLET-LAME AIR VENTILE
Seuil: R > 0.22 m2.K/W (strictement superieur). Source: guide MPR 2026 page 50 - criteres CEE uniquement.
conforme=true si R > 0.22 (strictement).
conforme=false si R = 0.22 (doit etre strictement superieur).
conforme=null si R absent.
alerte_mpr="Volet isolant: criteres techniques s appliquent pour CEE - verifier eligibilite MPR".

=== BLOC 4 - EQUIPEMENTS CHAUFFAGE ET ECS PAR POSTE ===
Identifier le TYPE EXACT d equipement. Ne pas confondre les postes.

POSTE: PAC AIR/EAU BASSE TEMPERATURE (35 degres C)
Seuil MPR: ETAS >= 126%. Source: guide MPR 2026 page 53.
Regulation performante classe IV minimum obligatoire.
Si PAC avec appoint combustible: taux couverture PAC >= 70%.
conforme=true si ETAS >= 126%.
conforme=null si ETAS absent + commentaire "ETAS manquant - obligatoire sur devis MPR 2026".
Eligible MPR par geste 2026.

POSTE: PAC AIR/EAU MOYENNE ET HAUTE TEMPERATURE (55 degres C)
Seuil MPR: ETAS >= 111%. Source: guide MPR 2026 page 53.
Regulation performante classe IV minimum obligatoire.
conforme=true si ETAS >= 111%.
conforme=null si ETAS absent + commentaire "ETAS manquant - obligatoire sur devis MPR 2026".
Eligible MPR par geste 2026.

POSTE: PAC GEOTHERMIQUE (eau/eau, sol/eau, sol/sol)
Seuil MPR: ETAS >= 126%. Source: guide MPR 2026 page 53.
Regulation performante classe IV minimum obligatoire.
conforme=true si ETAS >= 126%.
conforme=null si ETAS absent.
Eligible MPR par geste 2026.

POSTE: PAC AIR/AIR
NON ELIGIBLE MPR PAR GESTE ET ECO-PTZ. Source: guide MPR 2026 page 53.
alerte_mpr="PAC air/air: NON eligible MPR par geste ni eco-PTZ. Eligible CEE uniquement si COP saisonnier >= 3.9".
conforme=false pour MPR par geste.
Verifier quand meme COP saisonnier si mentionne (seuil CEE >= 3.9).

POSTE: CHAUFFE-EAU THERMODYNAMIQUE (CET)
Seuil MPR par profil de soutirage. Source: guide MPR 2026 page 53.
- Profil M: efficacite energetique chauffage eau >= 95%
- Profil L: efficacite energetique chauffage eau >= 100%
- Profil XL: efficacite energetique chauffage eau >= 110%
Identifier le profil de soutirage mentionne sur le devis.
conforme=true si valeur >= seuil du profil correspondant.
conforme=null si valeurs absentes + commentaire "Profil soutirage et ETAS manquants - obligatoires MPR".
Eligible MPR par geste 2026.

POSTE: POELE OU INSERT A BUCHES (manuel)
Seuil MPR: efficacite energetique saisonniere >= 65%. Source: guide MPR 2026 page 52.
Label Flamme Verte 7 etoiles obligatoire pour MPR.
Exigences emissions pour poeles et inserts manuels:
- Monoxyde de carbone <= 1500 mg/Nm3
- Composes organiques volatils <= 120 mg/Nm3
- Particules fines <= 40 mg/Nm3
- Oxydes d azote <= 200 mg/Nm3
conforme=true si ETAS >= 65% et Flamme Verte presente.
conforme=false si Flamme Verte absente.
conforme=null si ETAS absent.
Eligible MPR par geste 2026.

POSTE: POELE OU INSERT A GRANULES OU PLAQUETTES (automatique)
Seuil MPR: efficacite energetique saisonniere >= 79%. Source: guide MPR 2026 page 52.
Label Flamme Verte 7 etoiles obligatoire pour MPR.
Exigences emissions pour poeles et inserts automatiques:
- Monoxyde de carbone <= 300 mg/Nm3
- Composes organiques volatils <= 60 mg/Nm3
- Particules fines <= 20 mg/Nm3
- Oxydes d azote <= 200 mg/Nm3
conforme=true si ETAS >= 79% et Flamme Verte presente.
conforme=false si Flamme Verte absente.
conforme=null si ETAS absent.
Eligible MPR par geste 2026.

POSTE: CHAUDIERE BOIS OU BIOMASSE
CEE UNIQUEMENT - NON ELIGIBLE MPR PAR GESTE. Source: guide MPR 2026 page 51.
alerte_mpr="Chaudiere bois/biomasse: NON eligible MPR par geste - eligible CEE uniquement".
Criteres techniques CEE:
- Puissance thermique <= 70 kW
- Classe 5 norme NF EN 303.5
- Regulation classe IV minimum
- ETAS > 77% si puissance <= 20 kW
- ETAS > 79% si puissance > 20 kW
- Chaudiere alimentation automatique avec silo >= 225 litres
- Chaudiere alimentation manuelle avec ballon tampon
Exigences emissions chaudieres manuelles:
- Monoxyde de carbone < 600 mg/Nm3
- Composes organiques volatils < 20 mg/Nm3
- Particules fines < 40 mg/Nm3
- Oxydes d azote < 200 mg/Nm3
Exigences emissions chaudieres automatiques:
- Monoxyde de carbone < 400 mg/Nm3
- Composes organiques volatils < 16 mg/Nm3
- Particules fines < 30 mg/Nm3
- Oxydes d azote < 200 mg/Nm3
conforme selon criteres techniques CEE meme si non eligible MPR.

=== BLOC 5 - VMC DOUBLE FLUX ===
POSTE: VMC DOUBLE FLUX
Source: guide MPR 2026 page 51.
Eligible MPR par geste 2026 uniquement si realisee avec isolation thermique concomitante.
alerte_mpr si VMC seule sans isolation concomitante: "VMC double flux eligible MPR uniquement si realisee avec isolation thermique concomitante".

Installation individuelle (un seul logement):
- Caisson efficacite energetique classe A ou superieure
- Echangeur efficacite thermique > 85% (correspond caisson certifie NF 205 ou equivalent)
- Puissance electrique absorbee ponderee <= 47.6 WThC en config T4 (certifie NF 205)

Installation collective (plusieurs logements):
- Caisson double flux collectif
- Echangeur statique collectif, rendement temperature >= 75%
- Certifie Eurovent AAHE ou AARE ou equivalent

conforme=true si criteres respectes selon type installation.
conforme=null si valeurs absentes + commentaire "Classe energetique et efficacite echangeur manquants - obligatoires MPR".

=== BLOC 6 - TRAVAUX INDUITS GUIDE ANAH JUILLET 2025 ===
Lire chaque ligne du devis et classer: eligible, exclu ou remise.

ELIGIBLE (liste exacte guide ANAH):
Echafaudage, nacelles, lignes de vie, preparation chantier, nettoyage.
Depose repose equipements et ouvrages existants.
Depose revetements sols et facade pour isolation thermique.
Pose revetements pour maintenir proteger isolant (plaques platre, lambris, faux plafond) UNIQUEMENT si directement lie a isolation thermique deja posee.
Raccordement electrique ventilation ou equipement chauffage ou ECS.
Modifications plomberie, reseaux interieurs, platrerie, peintures consecutifs aux travaux.
Reprise appuis, linteaux, tableaux apres travaux.
Remise en etat suite degradation due aux travaux.
Deplacement volets suite isolation thermique.
Deplacement agrandissement reduction ouvertures EXISTANTES (pas creation nouvelle).
Pose revetement sol UNIQUEMENT en cas installation plancher chauffant ou isolation plancher par interieur.
Pose revetement mur UNIQUEMENT en cas isolation thermique par interieur (ITI).
Traitement humidite: arases etanches, drainage, vides sanitaires.
Membrane pare-vapeur, frein-vapeur.
Depose repose gouttieres evacuations eaux pluviales existantes sans creation nouvelles.
Deport grilles ventilation, zinguerie, ferronnerie.
Dispositifs fixation isolant: chevillage, collage, rail, ossature.
Depose repose structures solidaires: marquise, auvent, balcon, garde-corps, luminaires, volets-battants pour permettre isolation.
Ravalement facade consecutif ITE: decapage, nettoyage, ragreage, enduit.
Reprise appuis fenetres, corniches, acroteres apres ITE.
Couvertine, avancee toit pour proteger isolant.
Ecrans sous toiture.
Depose repose couverture pour isolation toiture par exterieur.
Renovation souches, lucarnes, corniches liees isolation toiture.
Renforcement charpente points singuliers defaillants.
Motorisation volets persiennes: raccordement electrique, telecommande.
Pose depose isolant coffre volets roulants existants.
Peinture et platrerie consecutifs pose volets.
Mise en place chapeaux toiture pour ventilation.
Creation adaptation tuyaux evacuation condensats.
Installation entrees prises air, bouches extraction.
Amelioration etancheite ou remplacement trappes acces, boites encastrement, gaines techniques.
Detalonnage portes interieures pour ventilation.
Creation socle, carottage, ouvertures murales pour equipement chauffage.
Forage terrassement PAC geothermique ou raccordement reseau chaleur.
Depose mise en decharge equipements anciens: cuve fioul, citerne gaz, chaudieres.
Thermostat ambiance, programmateur, sonde, robinets thermostatiques.
Reequilibrage, desembouage, nettoyage circuit chauffage.
Remplacement radiateurs, planchers chauffants lies a nouveau equipement chauffage.
Chape beton coulee sur plancher chauffant.
Ballon tampon, hydro-accumulation.
Fumisterie, tubage, ramonage, debistrage, creation conduit evacuation.
Tableau electrique UNIQUEMENT dans cadre installation equipement chauffage ou ECS.
Adaptation toiture consecutive creation conduit cheminee.

EXCLU (liste exacte guide ANAH - priorite absolue):
Creation de cloisons interieures (toute cloison quelle que soit composition) = EXCLU ABSOLU.
Habillage WC suspendu, habillage baignoire, coffrage, caisson = EXCLU.
Plaques BA13 hydro ou marine en amenagement pieces humides SDB WC = EXCLU.
Plus-value BA13 hydro en remplacement BA13 standard pieces humides = EXCLU.
Pose revetements decoratifs murs (papiers peints, peinture decorative) = EXCLU.
Pose revetement sol (carrelage, bois, pvc) SAUF plancher chauffant ou isolation plancher par interieur = EXCLU.
Creation nouvelles ouvertures = EXCLU.
Creation escalier acces combles = EXCLU.
Pose stores interieurs = EXCLU.
Nettoyage peinture balcons, loggias, terrasses, volets sauf degradation pendant travaux = EXCLU.
Changement garde-corps sauf si necessaire pour deposer pour realiser isolation = EXCLU.
Elements decoratifs: faience decorative, banquettes = EXCLU.
Travaux embellissement et habillage insert = EXCLU.
Panneaux photovoltaiques, eolien, pico-hydroelectricite, cogénération = EXCLU.
Tableau electrique SAUF si lie a installation equipement chauffage ou ECS = EXCLU.
Refection totale installation electrique = EXCLU.
Branchement raccordement electrique reseau modification puissance = EXCLU.
Creation tranchee raccordement gaz ou electricite = EXCLU.
Frais remise en etat site remblais suite depose cuve citerne = EXCLU.
Extension chauffage dans pieces non chauffees initialement = EXCLU.
Installation adoucisseurs eau = EXCLU.
Appareils individualisation frais chauffage = EXCLU.
Installation materiels controle suivi consommations eau electricite compteurs individuels = EXCLU.
Desamiantage resultant obligations reglementaires = EXCLU.
Protection chantier traitement dechets amianteés = EXCLU.

REMISE: toute ligne negative (remise, reduction, escompte, avoir, moins-value) = classer dans remises, deja deduite du total HT.

REGLE FINALE TRAVAUX INDUITS: exclusions ont PRIORITE ABSOLUE. Un poste exclu reste exclu meme si son libelle contient "consecutif" ou "platrerie".

Retourne ce JSON avec les vraies valeurs du document:
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"total_ht":0,"total_ttc":0,"taux_tva":[],"lignes_tva":[{"taux":"","montant_ht":0,"montant_tva":0,"postes":""}],"remises":[{"designation":"","montant_ht":0,"commentaire":""}],"alerte_tva_multiple":false,"commentaire_tva":""}}${isDevis ? `,"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}` : ''},"postes_isolation":{"present":false,"commentaire":"","postes":[{"type_poste":"(toiture_terrasse|rampants_combles|combles_perdus|murs_iti|murs_ite|plancher_bas)","libelle_devis":"","r_valeur":"","r_seuil":"","r_conforme":null,"surface_m2":"","type_isolant":"","epaisseur_mm":"","acermi":"","alerte_mpr":"","commentaire":""}]},"postes_menuiseries":{"present":false,"commentaire":"","produits":[{"type_poste":"(fenetre_pf|fenetre_toiture|double_fenetre|porte_entree|volet_isolant)","libelle_devis":"","uw":"","sw":"","ud":"","r_volet":"","conforme":null,"alerte_mpr":"","commentaire":""}]},"postes_chauffage":{"present":false,"commentaire":"","equipements":[{"type_poste":"(pac_air_eau_bt|pac_air_eau_mt|pac_geothermique|pac_air_air|cet|poele_buches|insert_buches|poele_granules|insert_granules|chaudiere_biomasse)","libelle_devis":"","marque_reference":"","puissance_kw":"","etas_valeur":"","etas_seuil":"","etas_conforme":null,"flamme_verte":{"present":false,"valeur":""},"rendement_valeur":"","rendement_seuil":"","rendement_conforme":null,"emissions":{"co":"","cov":"","particules":"","nox":"","conforme":null},"profil_soutirage":"","taux_couverture":"","classe_regulation":"","alerte_mpr":"","commentaire":""}]},"poste_vmc":{"present":false,"type_installation":"(individuelle|collective)","classe_energetique_caisson":"","efficacite_echangeur":"","certification":"","conforme":null,"alerte_mpr":"","commentaire":""}},"travaux_induits":{"eligibles":[{"designation":"","montant_ht":0,"commentaire":""}],"exclus":[{"designation":"","montant_ht":0,"raison_exclusion":"","commentaire":""}],"remises":[{"designation":"","montant_ht":0,"commentaire":"deja deduite du total"}],"total_induits_eligibles_ht":0,"total_exclus_ht":0,"montant_a_deduire_ht":0,"montant_corrige_ht":0,"commentaire_global":""},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

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

    // Nettoyage robuste
    raw = raw.replace(/[ -
--]/g, ' ')
    raw = raw.replace(/	/g, ' ')
    raw = raw.replace(/
/g, '')
    raw = raw.replace(/
/g, ' ')

    // Extraire le JSON entre le premier { et le dernier }
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) return res.status(500).json({ error: 'Reponse invalide. Reessayez.' })
    raw = raw.substring(start, end + 1)

    // Tentative de parse avec reparation si echec
    try {
      return res.status(200).json(JSON.parse(raw))
    } catch(parseErr) {
      // Reparer apostrophes non echappees dans les valeurs
      const fixed = raw
        .replace(/([^\])'([^,}\]:])/g, "$1\'$2")
        .replace(/,\s*}/g, '}')
        .replace(/,\s*]/g, ']')
      try {
        return res.status(200).json(JSON.parse(fixed))
      } catch(e2) {
        // Retourner debug info
        const pos = parseInt(parseErr.message.match(/position (\d+)/)?.[1] || '0')
        return res.status(500).json({
          error: parseErr.message,
          debug: raw.substring(Math.max(0, pos-80), pos+80)
        })
      }
    }

  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
