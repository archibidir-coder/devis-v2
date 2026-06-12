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

ANALYSE DES MONTANTS - OBLIGATOIRE:
- Lis le tableau financier du devis et extrait le total HT final et total TTC final (apres toutes remises)
- Identifie TOUS les taux de TVA utilises dans le devis (ex: 5.5%, 10%, 20%)
- Pour chaque taux de TVA: indique les postes concernes et le montant HT correspondant
- Si plusieurs taux de TVA differents: alerte_tva_multiple=true et explique dans commentaire_tva quelles lignes ont quel taux
- Les remises et reductions sont DEJA deduites dans le total HT final. Ne pas les retraiter.
- Exemple TVA multiple: "Pose 5.5% sur travaux renovation, fournitures independantes 20%, honoraires 20%"

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

ATTENTION REMISES ET REDUCTIONS:
- Une remise, reduction, escompte ou avoir est une ligne NEGATIVE. NE PAS la classer comme travail induit exclu.
- Les remises sont deja incluses dans le montant total HT. Ne pas les deduire une deuxieme fois.
- Classer une remise dans travaux_induits.remises uniquement.

TRAVAUX INDUITS ELIGIBLES - COMMUNS A TOUS LES POSTES DE TRAVAUX:
Source: Guide ANAH Juillet 2025, page 13-15.
- Depose et pose des equipements, produits et ouvrages necessaires a la realisation des travaux (preparation et desinstallation de chantier: echafaudages, nacelles, lignes de vie, affichages preventifs, base de vie ouvriers, nettoyage et deblaiement)
- Depose mise en decharge et traitement des equipements, produits et ouvrages existants (depose de revetements de sols et facade en cas d isolation thermique)
- Travaux preparatoires ou travaux de remise en etat consecutifs aux travaux: modifications installation electrique, plomberie, reseaux interieurs, elements de maconnerie, couverture, platrerie, peintures, revetements sol et mur
- Pose des revetements pour maintenir ou proteger l isolant: plaques de platre, lambris, faux plafond
- Raccordement electrique de la ventilation ou de l equipement de chauffage ou de production ECS, modification points eclairage/interrupteurs/prises en cas d isolation thermique, remplacement ou installation tableau electrique en cas d installation equipement chauffage ou ECS
- Modifications plomberie, reseaux interieurs (ex pour ventilation), platrerie et peintures
- Reprise des appuis, linteaux, tableaux
- Eventuels travaux remise en etat suite degradation due aux travaux
- Deplacement des volets suite a travaux isolation thermique
- Deplacement, agrandissement et reduction des ouvertures
- Pose revetement sol en cas installation plancher chauffant
- Pose revetement mur en cas isolation thermique par interieur

TRAVAUX INDUITS ELIGIBLES - COMMUNS A TOUS LES POSTES D ISOLATION:
- Traitement et prevention de l humidite: realisation d arases etanches, traitement humidite vides sanitaires, drainage des sols et maconneries
- Traitement etancheite a l air: pose membrane pare-vapeur, frein-vapeur, amelioration etancheite trappes acces, boites encastrement prises/interrupteurs, gaines techniques, canalisations, coffres volets
- Travaux de ventilation permettant assurer renouvellement air minimal

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - ISOLATION MURS ET BARDAGE VENTIЛЕ:
- Preparation du support: ravalement facade consecutif isolation exterieur (decapage, nettoyage, ragreage, depiquage enduits, doublage facade), reprise appuis fenetres, corniches, acroteres, depose repose ou adaptation modeatures et elements patrimoniaux existants, depose repose evacuation eaux pluviales/gouttieres existantes (sans creation nouvelles gouttieres), deport grilles ventilation, zinguerie, ferronnerie, refection cache-moineaux
- Dispositifs fixation et protection isolant: chevillage, dilatation, collage, fixation mecanique rail, ossature/profiles support revetements exterieurs, pose revetements proteger isolant (plaques platre, lambris, faux plafond enduit, sous-enduit arme, cornieres, bande-filante incendie, bavettes/profiles/appuis fenetres, finitions chaux/minerale/revetements plastiques)
- Realisation avancee toit ou couvertine protegeant isolant, ajouts tuiles/ardoises, protection isolation
- Depose et repose structures solidaires facade (marquise, auvent, balcon, garde-corps, luminaires, volets-battants, store-banne), depose repose evacuation eaux pluviales/gouttieres dont creation nouvelles gouttieres, deport grilles ventilation, zinguerie, ferronnerie

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - ISOLATION PLANCHERS BAS:
- Preparation protection ou refection des sols: depose repose revetements sols en cas isolation thermique planchers par interieur, installation lit ragreage (sable, mortier), dalle beton, dalle chaux, protection sous face planchers en cas isolation bas par exterieur
- Dispositifs fixation et protection isolant: chevillage, dilatation, collage, rail, chapes finition

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - ISOLATION TOITURE ET SUR-TOITURE VENTIЛЕЕ:
- Travaux refection couverture existante: depose repose couverture toiture en cas isolation par exterieur, depose repose/adaptation evacuation eaux pluviales/gouttieres, renovation souches/lucarnes/corniches, creation trappe acces combles, pose ecrans sous toiture, pose panneau sandwich bac-acier
- Dispositifs fixation et protection isolant: chevillage, rail, revetements (plaques platre, lambris, faux plafond, sous-enduit arme, cornieres, bavettes, finitions), ecrans sous toiture
- Reprise points singuliers toiture et couverture pour etancheite: remplacement tuiles/ardoises, reprise jonction conduits/eaux pluviales/fumees, refection totale etancheite toitures terrasses, ecrans sous toiture
- Reprise charpente preparatoire points singuliers defaillants toiture: remplacement ponctuels et renforcement charpentes

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - ISOLATION MENUISERIES EXTERIEURES:
- Motorisation eventuelle fermetures (volets, persiennes): raccordement electrique volets, peinture et platrerie consecutifs, telecommande volets roulants
- Fourniture et pose coffre volets: peinture et platrerie consecutifs
- Isolation coffres volets roulants existants: pose/depose isolant coffre existant, peinture/platrerie consecutifs, reprise etancheite a l air

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - VENTILATION:
- Adaptation couverture: chapeaux toiture, depose repose/adaptation evacuation eaux pluviales/gouttieres, deport grilles ventilation, zinguerie, ferronnerie
- Creation/adaptation systemes evacuation condensats: installation/modification tuyaux evacuation condensats
- Reprise etancheite a l air: installation entrees/prises air et bouches extraction, pose/depose conduits, amelioration etancheite trappes acces/boites encastrement/gaines/canalisations/coffres volets, membrane pare-vapeur/frein-vapeur, detalonnage portes interieures

TRAVAUX INDUITS ELIGIBLES SPECIFIQUES - INSTALLATION EQUIPEMENT CHAUFFAGE OU ECS:
- Travaux genie civil: creation chape/socle, carottage, ouvertures murales, sorties toiture-terrasse, obturation conduit
- Travaux forage et terrassement: echangeur chaleur souterrain PAC geothermique, terrassement raccordement reseaux chaleur
- Fourniture et pose equipements stockage combustible: cuve, citerne, silo, convoyage granules/plaquettes
- Depose mise en decharge equipements stockage combustible existants: cuve fioul, citerne gaz, chaudieres, vidange, degazage, nettoyage, comblement reservoir
- Materiaux calorifugeage et appareils regulation: thermostat ambiance, programmateur, sonde interieure/exterieure, robinets thermostatiques
- Travaux adaptation emetteurs chaleur eau chaude et distribution: reequilibrage, desembouage, nettoyage circuit chauffage, adaptation remplacement installation emetteurs existants (radiateurs, planchers chauffants), chape beton plancher chauffant, ballon tampon/hydro-accumulation
- Adaptation installation systemes evacuation produits combustion: fumisterie, tubage, ramonage, debistrage, creation cheminee cas pose insert, demolition cheminee cas pose poele, creation arrivee air, carottage, protection conduit existant (coquille isolante, coffrage), test fumigene
- Reprise ou renforcement charpente au niveau points singuliers defaillants toiture
- Travaux ventilation renouvellement air minimal

TRAVAUX INDUITS EXCLUS - SOURCE GUIDE ANAH JUILLET 2025 (liste non exhaustive):
Les postes suivants ne sont PAS des travaux induits eligibles:
- Travaux de desamiantage resultant d obligations reglementaires
- En cas intervention materiaux amianteés: depenses specifiques protection chantier, mise en decharge et traitement dechets amianteés
- Creation de cloisons interieures
- Creation d un escalier d acces aux combles
- Pose de revetements sur l ensemble des murs (papiers peints, peinture decorative, etc.)
- Pose de revetement de sol (carrelage, bois, pvc, etc.) SAUF en cas installation plancher chauffant ou isolation thermique planchers par interieur
- Creation de nouvelles ouvertures
- Pose de stores interieurs
- Nettoyage ou peinture balcons, loggias, terrasses ou volets (sauf si degradation pendant travaux)
- Changement garde-corps SAUF si necessaire de les deposer pour realiser l isolation
- Elements decoratifs: carreaux faience decoratifs parois exterieures ou banquettes
- Travaux embellissement et habillage insert
- Production electrique decentralisee: panneaux photovoltaiques, petit eolien, pico-hydroelectricite, equipements cogeneration
- Remplacement ou installation tableau electrique SAUF dans cadre installation equipement chauffage
- Refection totale installation electrique
- Travaux branchement/raccordement electrique au reseau (modification puissance)
- Creation tranchee raccordement gaz ou electricite (raccordement reseau chaleur urbain)
- Frais remise en etat site (remblais) suite depose cuve/citerne fioul/gaz
- Extension systeme chauffage dans pieces non chauffees initialement
- Installation adoucisseurs eau
- Appareils individualisation frais chauffage
- Installation materiels controle et suivi consommations eau, electricite (compteurs individuels, robinetterie adaptee)

REGLE DE CLASSIFICATION - STRICTE ET SANS INTERPRETATION:
1. Lire chaque ligne du devis
2. Si la ligne correspond EXACTEMENT a un poste exclu -> classer EXCLU. Les exclusions ont priorite absolue.
3. Si la ligne correspond EXACTEMENT a un poste eligible -> classer eligible
4. Si c est une remise/reduction/escompte -> classer dans remises
5. Si c est le travail principal de renovation energetique -> ne pas classer (travail principal, pas induit)
6. En cas de doute: classer EXCLU

REGLES STRICTES DE CLASSIFICATION PAR POSTE - GUIDE ANAH JUILLET 2025:

=== ISOLATION THERMIQUE ===
ELIGIBLE:
- Echafaudage, nacelles, lignes de vie pour travaux isolation
- Depose repose revetements sols/facades pour isolation
- Ravalement de facade consecutif a isolation exterieure (decapage, nettoyage, ragreage, enduit)
- Reprise appuis fenetres, corniches, acroteres apres ITE
- Depose repose gouttieres et evacuations eaux pluviales existantes (sans creation nouvelles gouttieres)
- Deport grilles ventilation, zinguerie, ferronnerie
- Dispositifs de fixation isolant: chevillage, collage, rail, ossature
- Faux plafond ou plaque platre pose UNIQUEMENT pour maintenir ou proteger un isolant thermique deja installe au plafond ou au mur
- Pose revetement mur en cas d isolation thermique par interieur (ITI uniquement)
- Pose revetement sol en cas d isolation plancher par interieur ou plancher chauffant
- Traitement humidite: arases etanches, drainage, vides sanitaires
- Membrane pare-vapeur, frein-vapeur
- Depose repose structures solidaires facade: marquise, auvent, balcon, garde-corps, luminaires, volets-battants (pour permettre l isolation)
- Couvertine, avancee de toit pour proteger isolant
- Trappe acces combles (creation uniquement si necessaire pour isolation)
- Ecrans sous toiture
- Depose repose couverture pour isolation toiture par exterieur
- Renovation souches, lucarnes, corniches liees a isolation toiture
- Renforcement charpente points singuliers defaillants

EXCLU:
- Creation de cloisons interieures (toute cloison: 72/48, 70/98, 48, phonique, hydro, contre-baignoire) = EXCLU ABSOLU
- Habillage WC suspendu, habillage baignoire, coffrage, caisson = EXCLU
- BA13 hydro ou marine en amenagement pieces humides (SDB, WC) = EXCLU
- Plus-value BA13 hydro/marine en remplacement BA13 standard = EXCLU
- Pose revetements decoratifs ensemble des murs (papiers peints, peinture decorative) = EXCLU
- Pose revetement sol (carrelage, bois, pvc) sauf plancher chauffant ou isolation plancher interieur = EXCLU
- Creation nouvelles ouvertures = EXCLU
- Creation escalier acces combles = EXCLU
- Pose stores interieurs = EXCLU
- Nettoyage ou peinture balcons, loggias, terrasses, volets (sauf degradation pendant travaux) = EXCLU
- Changement garde-corps (sauf si necessaire pour deposer pour realiser isolation) = EXCLU
- Elements decoratifs: faience decorative, banquettes = EXCLU
- Refection totale installation electrique = EXCLU
- Travaux branchement/raccordement electrique reseau (modification puissance) = EXCLU

=== MENUISERIES EXTERIEURES ===
ELIGIBLE:
- Motorisation volets/persiennes: raccordement electrique, telecommande
- Peinture et platrerie consecutifs a pose volets/persiennes
- Fourniture et pose coffre des volets
- Pose/depose isolant thermique coffre volets roulants existants
- Reprise etancheite a l air apres pose menuiseries
- Travaux peinture et platrerie consecutifs a l intervention menuiseries

EXCLU:
- Poses de stores interieurs = EXCLU
- Elements decoratifs = EXCLU
- Nettoyage ou peinture volets sauf si degradation pendant travaux = EXCLU

=== VENTILATION ===
ELIGIBLE:
- Mise en place chapeaux de toiture
- Depose repose/adaptation evacuation eaux pluviales/gouttieres existantes (sans creation nouvelles)
- Deport grilles ventilation, zinguerie, ferronnerie
- Installation/modification tuyaux evacuation condensats
- Installation entrees/prises d air et bouches extraction
- Pose/depose conduits
- Amelioration etancheite ou remplacement trappes acces, boites encastrement prises/interrupteurs, gaines techniques, canalisations, coffres volets
- Membrane pare-vapeur, frein-vapeur
- Detalonnage portes interieures

EXCLU:
- Refection totale installation electrique = EXCLU
- Travaux branchement reseau = EXCLU
- Creation nouvelles ouvertures = EXCLU

=== CHAUFFAGE ET ECS (PAC, CHAUDIERE, POELE, INSERT, CET) ===
ELIGIBLE:
- Creation chape/socle accueil unite production chaleur
- Carottage, ouvertures murales, sorties toiture-terrasse, obturation conduit
- Travaux forage et terrassement PAC geothermique ou raccordement reseau chaleur
- Fourniture et pose stockage combustible: cuve, citerne, silo, convoyage granules/plaquettes
- Depose mise en decharge equipements existants: cuve fioul, citerne gaz, chaudieres (vidange, degazage, nettoyage, comblement)
- Thermostat ambiance, programmateur, sonde interieure/exterieure, robinets thermostatiques
- Reequilibrage, desembouage, nettoyage circuit chauffage ou ECS
- Remplacement installation emetteurs chaleur: radiateurs, planchers chauffants
- Chape beton coulee sur plancher chauffant
- Ballon tampon, hydro-accumulation
- Fumisterie, tubage, ramonage, debistrage
- Creation cheminee en cas pose insert (hors embellissement/decoration)
- Demolition cheminee en cas pose poele
- Creation arrivee air, protection conduit existant (coquille isolante, coffrage)
- Test fumigene
- Adaptation toiture consecutive a creation/modification conduit cheminee
- Renforcement charpente points singuliers
- Travaux ventilation renouvellement air minimal
- Remplacement tableau electrique UNIQUEMENT dans le cadre installation equipement chauffage ou ECS
- Raccordement electrique equipement chauffage ou ECS

EXCLU:
- Extension systeme chauffage dans pieces non chauffees initialement = EXCLU
- Installation adoucisseurs eau = EXCLU
- Appareils individualisation frais chauffage = EXCLU
- Installation materiels controle/suivi consommations eau/electricite (compteurs individuels) = EXCLU
- Travaux embellissement et habillage insert = EXCLU
- Remplacement ou installation tableau electrique SAUF si lie a installation equipement chauffage = EXCLU
- Refection totale installation electrique = EXCLU
- Travaux branchement/raccordement electrique reseau = EXCLU
- Creation tranchee raccordement gaz ou electricite = EXCLU
- Frais remise en etat site (remblais) suite depose cuve/citerne = EXCLU
- Production electrique decentralisee (photovoltaique, eolien, pico-hydroelectricite, cogénération) = EXCLU

=== REGLE FINALE ABSOLUE ===
- Les exclusions ont PRIORITE ABSOLUE sur les eligibilites.
- Si un poste est dans la liste des exclus, il est EXCLU meme si son libelle contient "consecutif", "platrerie", "isolation", "lie aux travaux".
- Une cloison est TOUJOURS exclue, peu importe sa composition (laine phonique, laine thermique, BA13 hydro).
- Un habillage, coffrage, caisson est TOUJOURS exclu.
- En cas de doute: classer EXCLU.

Retourne ce JSON avec les vraies valeurs du document:
{"type_document":"${mode}","checks":{"siret":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"date_emission":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"numero_document":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rcs_rne":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"adresse_siege":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"tva_intra":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"montants":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"total_ht":0,"total_ttc":0,"taux_tva":[],"lignes_tva":[{"taux":"","montant_ht":0,"montant_tva":0,"postes":""}],"remises":[{"designation":"","montant_ht":0,"commentaire":""}],"alerte_tva_multiple":false,"commentaire_tva":""}}${isDevis ? ',"date_visite":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"rge":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"dechets":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""}' : ''},"perf_menuiseries":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":""},"perf_isolation":{"present":false,"conforme":null,"alerte_mpr":"","commentaire":"","details":{"surface_isoler":{"present":false,"valeur":"","commentaire":""},"type_isolant":{"present":false,"valeur":"","commentaire":""},"epaisseur":{"present":false,"valeur":"","commentaire":""},"acermi":{"present":false,"valeur":"","commentaire":""}}},"perf_pac":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"type_pac":"","etas":{"present":false,"valeur":"","conforme":null,"commentaire":""},"scop":{"present":false,"valeur":"","conforme":null,"commentaire":""},"cop":{"present":false,"valeur":"","conforme":null,"commentaire":""},"taux_couverture":{"present":false,"valeur":"","commentaire":""}}},"perf_bois":{"present":false,"valeur":"","conforme":null,"alerte_mpr":"","commentaire":"","details":{"type_equipement":"","flamme_verte":{"present":false,"valeur":"","conforme":null,"commentaire":""},"rendement":{"present":false,"valeur":"","conforme":null,"commentaire":""},"etas":{"present":false,"valeur":"","conforme":null,"commentaire":""}}}},"travaux_induits":{"eligibles":[{"designation":"","montant_ht":0,"commentaire":""}],"exclus":[{"designation":"","montant_ht":0,"raison_exclusion":"","commentaire":""}],"remises":[{"designation":"","montant_ht":0,"commentaire":"remise deja deduite dans le total"}],"total_induits_eligibles_ht":0,"total_exclus_ht":0,"montant_a_deduire_ht":0,"montant_corrige_ht":0,"commentaire_global":""},"score":0,"total":0,"verdict":"incomplet","remarque_globale":""}`

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
