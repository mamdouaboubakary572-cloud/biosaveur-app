const express = require('express');
const router = express.Router();
const Cotisation = require('../models/Cotisation');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { envoyerSMS } = require('../services/sms');
 
// Créer une cotisation
router.post('/', auth, async (req, res) => {
  try {
    const { clientId, objectifPoulets, prixUnitaire, mois, jourLivraisonChoisi } = req.body;
    const montantObjectif = objectifPoulets * (prixUnitaire || 2800);
    const cotisation = new Cotisation({
      client: clientId,
      objectifPoulets,
      prixUnitaire: prixUnitaire || 2800,
      montantObjectif,
      mois,
      jourLivraisonChoisi
    });
    await cotisation.save();
    try {
      const client = await User.findById(clientId);
      if (client && client.telephone) {
        await envoyerSMS('+225' + client.telephone,
          `Bonjour ${client.prenom}, votre cotisation BIOSAVEUR de ${objectifPoulets} poulets a été créée. Montant: ${montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS err:', smsErr.message); }
    res.status(201).json({ message: 'Cotisation créée', cotisation });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});
 
// Toutes les cotisations (admin)
router.get('/', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find()
      .populate('client', 'nom prenom telephone jourLivraison')
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
    try {
      await cotisation.populate('client', 'nom prenom telephone');
      const cl = cotisation.client;
      if (cl && cl.telephone) {
        await envoyerSMS('+225' + cl.telephone,
          `Bonjour ${cl.prenom}, versement de ${montant} FCFA enregistré. Total: ${cotisation.montantCollecte}/${cotisation.montantObjectif} FCFA.`);
      }
    } catch (smsErr) { console.error('SMS versement err:', smsErr.message); }
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

    const moisNoms = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    const moisActuel = new Date(cotisationActuelle.mois || Date.now());
    const moisSuivantDate = new Date(moisActuel);
    moisSuivantDate.setMonth(moisSuivantDate.getMonth() + 1);
    const moisSuivant = moisNoms[moisSuivantDate.getMonth()] + ' ' + moisSuivantDate.getFullYear();
    const nouvelleCotisation = new Cotisation({
      client: cotisationActuelle.client,
      mois: moisSuivant,
      objectifPoulets: cotisationActuelle.objectifPoulets,
      prixUnitaire: cotisationActuelle.prixUnitaire,
      montantObjectif: cotisationActuelle.montantObjectif,
      montantCollecte: 0,
      versements: [],
      statut: 'en_cours',
      jourLivraisonChoisi: cotisationActuelle.jourLivraisonChoisi,
      encaisse: false,
      cotisationPrecedenteId: cotisationActuelle._id
    });
    await nouvelleCotisation.save();

    res.json({
      message: 'Livraison confirmée, nouvelle cotisation créée',
      cotisationLivree: cotisationActuelle,
      nouvelleCotisation
    });
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
// TEMPORAIRE - Migrer les anciennes cotisations vers le système articles[]
router.get('/migrer-articles', auth, async (req, res) => {
  try {
    const cotisations = await Cotisation.find({ articles: { $exists: false } });
    let migrees = 0;

    for (const c of cotisations) {
      if (c.objectifPoulets) {
        const prixUnitaire = c.prixUnitaire || 2800;
        const sousTotal = c.objectifPoulets * prixUnitaire;
        c.articles = [{
          produit: 'Poulet entier - Classic',
          quantite: c.objectifPoulets,
          prixUnitaire: prixUnitaire,
          sousTotal: sousTotal
        }];
        await c.save();
        migrees++;
      }
    }

    res.json({ message: `${migrees} cotisation(s) migrée(s) vers le système articles[]` });
  } catch (err) {
    res.status(500).json({ message: 'Erreur serveur', erreur: err.message });
  }
});

module.exports = router;
