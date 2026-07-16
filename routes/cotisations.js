const express = require('express');
const router = express.Router();
const Cotisation = require('../models/Cotisation');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { envoyerSMS } = require('../services/sms');
const { envoyerPush } = require('../services/push');
const { logActivite } = require('../services/activite');
const Notification = require('../models/Notification');

const MAX_LIVRAISONS_PAR_JOUR = 10;
let derniereVerifRappels = null;

async function verifierRappelsLivraison() {
  const aujourdhui = new Date().toDateString();
  if (derniereVerifRappels === aujourdhui) return; // déjà fait aujourd'hui
  derniereVerifRappels = aujourdhui;

  const demain = new Date();
  demain.setDate(demain.getDate() + 1);
  const demainStr = formatDateFr(demain.toISOString());

  try {
    const cotisations = await Cotisation.find({
      statut: { $in: ['en_cours', 'complete'] },
      jourLivraisonChoisi: { $regex: '^' + demainStr }
    });
    for (const c of cotisations) {
      await Notification.create({
        userId: c.client,
        message: `📅 Rappel : votre livraison BIOSAVEUR est prévue demain (${c.jourLivraisonChoisi}).`,
        type: 'rappel_livraison'
      });
    }
    console.log(demainStr + ' : ' + cotisations.length + ' rappel(s) de livraison créé(s)');
  } catch (err) {
    console.error('Erreur vérification rappels:', err.message);
  }
}

setInterval(verifierRappelsLivraison, 60 * 60 * 1000); // vérifie chaque heure

function formatDateFr(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
}
 
// Créer une cotisation
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, articles, mois, jourLivraisonChoisi } = req.body;
    if (!articles || !articles.length) {
      return res.status(400).json({ message: 'Au moins un article est requis' });
    }
    const articlesCalcules = articles.map(a => ({
      produit: a.produit,
      quantite: a.quantite,
      prixUnitaire: a.prixUnitaire,
      sousTotal: a.quantite * a.prixUnitaire
    }));
    let montantObjectif = articlesCalcules.reduce((s, a) => s + a.sousTotal, 0);

    // Vérifier si le client est Ambassadeur (6+ livraisons) → -5%
    const nbLivraisons = await Cotisation.countDocuments({ client: clientId, statut: 'livre' });
    const estAmbassadeur = nbLivraisons >= 6;
    if (estAmbassadeur) {
      montantObjectif = Math.round(montantObjectif * 0.95);
    }

    const cotisation = new Cotisation({
      client: clientId,
      articles: articlesCalcules,
      montantObjectif,
      mois,
      jourLivraisonChoisi,
      reductionAmbassadeur: estAmbassadeur
    });
  await cotisation.save();
    logActivite(req, 'Cotisation créée', `Cotisation de ${mois} créée pour un client (${montantObjectif} FCFA)`);
    try {
      const client = await User.findById(clientId);
      if (client && client.telephone) {
        const resume = articlesCalcules.map(a => `${a.quantite}x ${a.produit}`).join(', ');
        await envoyerSMS('+225' + client.telephone,
          `Bonjour ${client.prenom}, votre cotisation BIOSAVEUR (${resume}) a été créée. Montant: ${montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS err:', smsErr.message); }
   
  // Créer une notification pour le client
    try {
      await Notification.create({
        userId: cotisation.client,
        message: `Votre versement de ${montant} FCFA a été enregistré pour votre cotisation de ${cotisation.mois}.`,
        type: 'versement'
      });
      const clientPourPush = await User.findById(cotisation.client);
      envoyerPush(clientPourPush, 'BIOSAVEUR 💰', `Versement de ${montant} FCFA enregistré !`);
    } catch (notifErr) { console.error('Erreur notification versement:', notifErr.message); }
    res.status(201).json({ message: 'Cotisation créée', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Toutes les cotisations (admin)
router.get('/', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find()
      .populate('client', 'nom prenom telephone jourLivraison photo localisation')
      .sort({ dateCreation: -1 });
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Ajouter un versement
router.post('/:id/versement', auth, async (req, res) => {
  try {
    const { montant, modePaiement, reference } = req.body;
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });
    cotisation.versements.push({ montant, modePaiement, reference, date: new Date() });
    cotisation.montantCollecte += montant;
    if (cotisation.montantCollecte >= cotisation.montantObjectif) cotisation.statut = 'complete';
    await cotisation.save();
    logActivite(req, 'Versement enregistré', `${montant} FCFA (${modePaiement || 'mode non précisé'})`);
    try {
      await cotisation.populate('client', 'nom prenom telephone');
      const cl = cotisation.client;
      if (cl && cl.telephone) {
        const heureVersement = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        await envoyerSMS('+225' + cl.telephone,
          `Bonjour ${cl.prenom}, versement de ${montant} FCFA enregistré à ${heureVersement}. Total: ${cotisation.montantCollecte}/${cotisation.montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS versement err:', smsErr.message); }
   
   // Créditer le parrain de 200 points si c'est le premier versement du filleul
    try {
      const clientUser = await User.findById(cotisation.client);
      if (clientUser && clientUser.parrainId) {
        const totalVersements = cotisation.versements.length;
        if (totalVersements === 1) {
          await User.findByIdAndUpdate(clientUser.parrainId, { $inc: { points: 200 } });
        }
      }
    } catch (parrainErr) { console.error('Erreur points parrain:', parrainErr.message); }
   
   // Créer une notification pour le client
    try {
      await Notification.create({
        userId: cotisation.client,
        message: `Votre versement de ${montant} FCFA a été enregistré pour votre cotisation de ${cotisation.mois}.`,
        type: 'versement'
      });
    } catch (notifErr) { console.error('Erreur notification versement:', notifErr.message); }
    res.json({ message: 'Versement enregistré', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Confirmer livraison + archivage automatique + nouvelle cotisation
router.put('/:id/livrer', auth, async (req, res) => {
  try {
    const cotisationActuelle = await Cotisation.findById(req.params.id);
    if (!cotisationActuelle) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }
    if (cotisationActuelle.statut === 'livre') {
      return res.status(400).json({ message: 'Cette cotisation est déjà livrée' });
    }

   cotisationActuelle.statut = 'livre';
    cotisationActuelle.dateLivraisonEffective = new Date();
    await cotisationActuelle.save();
    logActivite(req, 'Livraison confirmée', `Cotisation de ${cotisationActuelle.mois} livrée`);

    if (cotisationActuelle.renouvellementAuto === false) {
      return res.json({
        message: 'Livraison confirmée. Renouvellement automatique désactivé par le client.',
        cotisationLivree: cotisationActuelle
      });
    }

    const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    let moisSuivant;
    try {
      const parts = (cotisationActuelle.mois || '').split(' ');
      const nomMois = parts[0];
      const annee = parseInt(parts[1]) || new Date().getFullYear();
      const moisIndex = moisNoms.findIndex(m => m.toLowerCase() === nomMois.toLowerCase());
      if (moisIndex !== -1) {
        const moisSuivantIndex = (moisIndex + 1) % 12;
        const anneeSuivante = moisIndex === 11 ? annee + 1 : annee;
        moisSuivant = moisNoms[moisSuivantIndex] + ' ' + anneeSuivante;
      } else {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        moisSuivant = moisNoms[d.getMonth()] + ' ' + d.getFullYear();
      }
    } catch(e) {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      moisSuivant = moisNoms[d.getMonth()] + ' ' + d.getFullYear();
    }
    const nouvelleCotisation = new Cotisation({
      mois: moisSuivant,
      articles: cotisationActuelle.articles,
      montantObjectif: cotisationActuelle.montantObjectif,
      montantCollecte: 0,
      versements: [],
      statut: 'en_cours',
      jourLivraisonChoisi: cotisationActuelle.jourLivraisonChoisi,
      encaisse: false,
      cotisationPrecedenteId: cotisationActuelle._id
    });
    await nouvelleCotisation.save();
   
// Créer une notification pour le client
    try {
      await Notification.create({
        userId: cotisationActuelle.client,
        message: `Votre commande de ${cotisationActuelle.mois} a été livrée. Merci pour votre confiance ! Une nouvelle cotisation a été créée pour le mois suivant.`,
        type: 'livraison'
      });
      const clientPourPush = await User.findById(cotisationActuelle.client);
      envoyerPush(clientPourPush, 'BIOSAVEUR 🚚', `Votre commande de ${cotisationActuelle.mois} a été livrée !`);
    } catch (notifErr) { console.error('Erreur notification livraison:', notifErr.message); }
    res.json({
      message: 'Livraison confirmée, nouvelle cotisation créée',
      cotisationLivree: cotisationActuelle,
      nouvelleCotisation
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Basculer le renouvellement automatique d'une cotisation
router.patch('/:id/renouvellement-auto', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });
    cotisation.renouvellementAuto = !cotisation.renouvellementAuto;
    await cotisation.save();
    res.json({ message: 'Renouvellement automatique mis à jour', renouvellementAuto: cotisation.renouvellementAuto });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Mettre à jour le jour de livraison
router.put('/:id/jour-livraison', auth, async (req, res) => {
  try {
    const { jourLivraisonChoisi } = req.body;
    const cotisation = await Cotisation.findByIdAndUpdate(
      req.params.id,
      { jourLivraisonChoisi },
      { new: true }
    );
    res.json({ message: 'Jour de livraison mis à jour', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Supprimer une cotisation
router.delete('/:id', auth, async (req, res) => {
  try {
    await Cotisation.findByIdAndDelete(req.params.id);
    res.json({ message: 'Cotisation supprimée' });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Cotisations du client connecté
router.get('/mes-cotisations', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ client: req.user.id });
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 // Basculer le statut encaissé
router.patch('/:id/encaisse', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) {
      return res.status(404).json({ message: 'Cotisation non trouvée' });
    }
    cotisation.encaisse = !cotisation.encaisse;
    await cotisation.save();
    res.json({ message: 'Statut encaissé mis à jour', encaisse: cotisation.encaisse, cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
// Historique des livraisons avec stats par client
router.get('/historique', auth, async (req, res) => {
  try {
    const cotisationsLivrees = await Cotisation.find({ statut: 'livre' })
      .populate('client', 'nom prenom telephone')
      .sort({ dateLivraisonEffective: -1 });

    const statsParClient = {};
    cotisationsLivrees.forEach(c => {
      const clientId = c.client?._id?.toString();
      if (!clientId) return;
      if (!statsParClient[clientId]) {
        statsParClient[clientId] = {
          client: c.client,
          totalLivre: 0,
          nombreLivraisons: 0,
          dates: []
        };
      }
      statsParClient[clientId].totalLivre += c.montantCollecte || 0;
      statsParClient[clientId].nombreLivraisons += 1;
      statsParClient[clientId].dates.push(c.dateLivraisonEffective);
    });

    Object.values(statsParClient).forEach(stat => {
      if (stat.dates.length > 1) {
        const datesTriees = stat.dates.filter(d => d).sort((a, b) => new Date(a) - new Date(b));
        let totalEcarts = 0;
        for (let i = 1; i < datesTriees.length; i++) {
          totalEcarts += (new Date(datesTriees[i]) - new Date(datesTriees[i - 1])) / (1000 * 60 * 60 * 24);
        }
        stat.frequenceMoyenneJours = Math.round(totalEcarts / (datesTriees.length - 1));
      } else {
        stat.frequenceMoyenneJours = null;
      }
      delete stat.dates;
    });

    res.json({
      cotisationsLivrees,
      statsParClient: Object.values(statsParClient)
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
// Statistiques mensuelles réelles (6 derniers mois)
router.get('/stats-mensuelles', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find();
    const clients = await User.find();

    const moisNoms = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
    const maintenant = new Date();
    const mois6 = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      mois6.push({ annee: d.getFullYear(), moisIndex: d.getMonth(), label: moisNoms[d.getMonth()] });
    }

    const stats = mois6.map(m => {
      const debutMois = new Date(m.annee, m.moisIndex, 1);
      const finMois = new Date(m.annee, m.moisIndex + 1, 0, 23, 59, 59);

      const cotisationsDuMois = cotisations.filter(c => {
        const d = new Date(c.createdAt);
        return d >= debutMois && d <= finMois;
      });

      const collecte = cotisationsDuMois.reduce((s, c) => s + (c.montantCollecte || 0), 0);
      const objectif = cotisationsDuMois.reduce((s, c) => s + (c.montantObjectif || 0), 0);

      const livraisonsDuMois = cotisations.filter(c => {
        if (!c.dateLivraisonEffective) return false;
        const d = new Date(c.dateLivraisonEffective);
        return d >= debutMois && d <= finMois;
      });

      const nouveauxClientsDuMois = clients.filter(cl => {
        const d = new Date(cl.dateCreation);
        return d >= debutMois && d <= finMois;
      });

      return {
        label: m.label,
        collecte,
        objectif,
        nbLivraisons: livraisonsDuMois.length,
        nbNouveauxClients: nouveauxClientsDuMois.length
      };
    });

    res.json(stats);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
// Liste des cotisations en retard (sans envoyer de SMS)
router.get('/retards', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ statut: 'en_cours' })
      .populate('client', 'nom prenom telephone');
    const retards = cotisations.filter(c =>
      (c.montantCollecte || 0) < (c.montantObjectif || 0) * 0.5
    );
    res.json(retards);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Envoyer SMS de relance aux cotisations sélectionnées
router.post('/relancer-retards', auth, async (req, res) => {
  try {
    const { cotisationIds } = req.body;
    if (!cotisationIds || !cotisationIds.length) {
      return res.status(400).json({ message: 'Aucune cotisation sélectionnée' });
    }

    const cotisations = await Cotisation.find({ _id: { $in: cotisationIds } })
      .populate('client', 'nom prenom telephone');

    let envoyes = 0;
    let echecs = 0;

   for (const c of cotisations) {
      if (c.client && c.client.telephone) {
        try {
          await envoyerSMS('+225' + c.client.telephone,
            `Bonjour, un petit coucou de BIOSAVEUR 🐓 Votre cotisation vous attend pour avancer vers votre objectif de poulets. Nous sommes disponibles pour toute question. Merci pour votre confiance !`);
          envoyes++;
        } catch (smsErr) {
          console.error('SMS relance err pour', c.client.telephone, ':', smsErr.message);
          echecs++;
        }
      }
    }

    res.json({ message: `${envoyes} SMS envoyé(s), ${echecs} échec(s)`, envoyes, echecs });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Historique des livraisons du client connecté (avec stats personnelles)
router.get('/mon-historique', auth, async (req, res) => {
  try {
    const cotisationsLivrees = await Cotisation.find({ client: req.user.id, statut: 'livre' })
      .sort({ dateLivraisonEffective: -1 });

    const totalLivre = cotisationsLivrees.reduce((s, c) => s + (c.montantCollecte || 0), 0);
    const nombreLivraisons = cotisationsLivrees.length;

    let frequenceMoyenneJours = null;
    const dates = cotisationsLivrees.filter(c => c.dateLivraisonEffective).map(c => c.dateLivraisonEffective);
    if (dates.length > 1) {
      const datesTriees = dates.sort((a, b) => new Date(a) - new Date(b));
      let totalEcarts = 0;
      for (let i = 1; i < datesTriees.length; i++) {
        totalEcarts += (new Date(datesTriees[i]) - new Date(datesTriees[i - 1])) / (1000 * 60 * 60 * 24);
      }
      frequenceMoyenneJours = Math.round(totalEcarts / (datesTriees.length - 1));
    }

    res.json({
      cotisationsLivrees,
      totalLivre,
      nombreLivraisons,
      frequenceMoyenneJours
    });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Supprimer un versement précis d'une cotisation
router.delete('/:id/versement/:versementId', auth, async (req, res) => {
  try {
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });

    const versement = cotisation.versements.find(v => v._id.toString() === req.params.versementId);
    if (!versement) return res.status(404).json({ message: 'Versement non trouvé' });

    cotisation.montantCollecte -= versement.montant;
    if (cotisation.montantCollecte < 0) cotisation.montantCollecte = 0;
    cotisation.versements = cotisation.versements.filter(v => v._id.toString() !== req.params.versementId);

    if (cotisation.montantCollecte < cotisation.montantObjectif && cotisation.statut === 'complete') {
      cotisation.statut = 'en_cours';
    }

    await cotisation.save();
    res.json({ message: 'Versement supprimé', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Stats avancées pour le dashboard admin
router.get('/stats-avancees', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find().populate('client', 'nom prenom telephone');
    const versements = [];
    cotisations.forEach(c => (c.versements||[]).forEach(v => versements.push({...v.toObject(), clientId: c.client?._id, clientNom: (c.client?.nom||'?') + ' ' + (c.client?.prenom||''), moisCot: c.mois})));

    // Top 5 clients par total versé
    const totauxParClient = {};
    versements.forEach(v => {
      const id = v.clientId?.toString();
      if (!id) return;
      if (!totauxParClient[id]) totauxParClient[id] = { nom: v.clientNom, total: 0 };
      totauxParClient[id].total += v.montant || 0;
    });
    const top5 = Object.values(totauxParClient).sort((a, b) => b.total - a.total).slice(0, 5);

    // Taux de complétion
    const terminees = cotisations.filter(c => c.statut === 'livre' || c.statut === 'complete');
    const tauxCompletion = cotisations.length > 0 ? Math.round((terminees.length / cotisations.length) * 100) : 0;

    // Revenu prévisionnel (cotisations en cours)
    const enCours = cotisations.filter(c => c.statut === 'en_cours');
    const revenuPrevisionnel = enCours.reduce((s, c) => s + ((c.montantObjectif||0) - (c.montantCollecte||0)), 0);

    // Carte de chaleur (versements par jour de semaine et heure)
    const chaleur = Array(7).fill(null).map(() => Array(24).fill(0));
    versements.forEach(v => {
      if (!v.date) return;
      const d = new Date(v.date);
      chaleur[d.getDay()][d.getHours()]++;
    });

    res.json({ top5, tauxCompletion, revenuPrevisionnel, chaleur });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Vérifier la disponibilité d'un créneau de livraison
router.get('/creneaux', auth, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'Date requise' });
    const dateFr = formatDateFr(date);
    const cotisations = await Cotisation.find({
      statut: { $in: ['en_cours', 'complete'] },
      jourLivraisonChoisi: { $regex: '^' + dateFr }
    });
    const total = cotisations.length;
    const restant = Math.max(0, MAX_LIVRAISONS_PAR_JOUR - total);
    res.json({ date: dateFr, total, max: MAX_LIVRAISONS_PAR_JOUR, restant, disponible: restant > 0 });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Le client note sa livraison
router.put('/:id/noter', auth, async (req, res) => {
  try {
    const { note, commentaireAvis } = req.body;
    if (!note || note < 1 || note > 5) return res.status(400).json({ message: 'Note invalide (1 à 5)' });
    const cotisation = await Cotisation.findById(req.params.id);
    if (!cotisation) return res.status(404).json({ message: 'Cotisation non trouvée' });
    if (cotisation.client.toString() !== req.user.id) return res.status(403).json({ message: 'Accès refusé' });
    if (cotisation.statut !== 'livre') return res.status(400).json({ message: 'Cette cotisation n\'est pas encore livrée' });
    cotisation.note = note;
    cotisation.commentaireAvis = commentaireAvis || '';
    await cotisation.save();
    res.json({ message: 'Merci pour votre avis !', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Livraisons prévues demain (pour rappels admin)
router.get('/livraisons-demain', auth, async (req, res) => {
  try {
    const demain = new Date();
    demain.setDate(demain.getDate() + 1);
    const demainStr = formatDateFr(demain.toISOString());
    const cotisations = await Cotisation.find({
      statut: { $in: ['en_cours', 'complete'] },
      jourLivraisonChoisi: { $regex: '^' + demainStr }
    }).populate('client', 'nom prenom telephone');
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Livraisons du jour (pour le rôle livreur)
router.get('/livraisons-aujourdhui', auth, async (req, res) => {
  try {
    const aujourdhui = formatDateFr(new Date().toISOString());
    const cotisations = await Cotisation.find({
      statut: { $in: ['en_cours', 'complete'] },
      jourLivraisonChoisi: { $regex: '^' + aujourdhui }
    }).populate('client', 'nom prenom telephone localisation');
    res.json(cotisations);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Prévision de demande (moyenne pondérée des 3 derniers mois)
router.get('/prevision-demande', auth, async (req, res) => {
  try {
    const maintenant = new Date();
    const mois3 = [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
      mois3.push({ debut: d, fin: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59) });
    }

    const poids = [1, 2, 3]; // le mois le plus récent compte 3x plus que le plus ancien
    let totalPondere = 0;
    let totalPoids = 0;
    const detailParProduit = {};

    for (let i = 0; i < mois3.length; i++) {
      const cotisationsDuMois = await Cotisation.find({
        createdAt: { $gte: mois3[i].debut, $lte: mois3[i].fin }
      });
      let quantiteMois = 0;
      cotisationsDuMois.forEach(c => {
        (c.articles || []).forEach(a => {
          quantiteMois += a.quantite;
          detailParProduit[a.produit] = (detailParProduit[a.produit] || 0) + a.quantite * poids[i];
        });
      });
      totalPondere += quantiteMois * poids[i];
      totalPoids += poids[i];
    }

    const previsionTotale = totalPoids > 0 ? Math.round(totalPondere / totalPoids) : 0;
    const topProduits = Object.entries(detailParProduit)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([produit, poids]) => ({ produit, quantiteEstimee: Math.round(poids / totalPoids) }));

    res.json({ previsionTotale, topProduits });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Tous les avis clients (pour le dashboard admin)
router.get('/avis', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ note: { $exists: true } })
      .populate('client', 'nom prenom')
      .sort({ updatedAt: -1 })
      .limit(20);
    const moyenne = cotisations.length ? (cotisations.reduce((s,c) => s + c.note, 0) / cotisations.length).toFixed(1) : 0;
    res.json({ avis: cotisations, moyenne, total: cotisations.length });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

// Journal d'activité (50 dernières actions)
router.get('/journal-activite', auth, async (req, res) => {
  try {
    const Activite = require('../models/Activite');
    const activites = await Activite.find().sort({ date: -1 }).limit(50);
    res.json(activites);
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;

