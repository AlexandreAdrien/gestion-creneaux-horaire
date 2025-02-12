const express = require('express');
const app = express();
const axios = require('axios');
const port = process.env.PORT || 10000;

// Middleware pour parser le JSON dans les requêtes
app.use(express.json());

// Récupère juste la partie date, en local
const dateOnly = occupiedSlots[0].start.split("T")[0];
// Pas de "Z" => on veut la timezone locale du serveur, ou on gère un offset nous-mêmes
const workDayStart = new Date(`${dateOnly}T08:00:00`); 
const workDayEnd   = new Date(`${dateOnly}T16:00:00`);

// Route pour identifier les créneaux libres
app.post('/occupied-slots', (req, res) => {
  const { value: occupiedSlots } = req.body;
  
  if (!occupiedSlots || occupiedSlots.length === 0) {
    return res.status(400).json({ message: "Invalid input, 'value' is required and should contain slots." });
  }

// On récupère l'heure exacte du premier slot pour commencer :
const firstSlot = new Date(occupiedSlots[0].start); // par ex. 2025-02-21T19:00:00
const workDayStart = new Date(firstSlot);           // on copie la même date/heure
// éventuellement, on définit workDayEnd = + X heures, si besoin
const workDayEnd   = new Date(firstSlot.getTime() + (8 * 60 * 60 * 1000)); 


  // Trier les créneaux occupés par ordre croissant de début
  const sortedOccupiedSlots = occupiedSlots
    .map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }))
    .sort((a, b) => a.start - b.start);

  // Initialiser les créneaux libres
  let freeSlots = [];
  let currentTime = workDayStart;

  // Identifier les créneaux libres
  for (const slot of sortedOccupiedSlots) {
    if (currentTime < slot.start) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: slot.start.toISOString(),
      });
    }
    currentTime = slot.end > currentTime ? slot.end : currentTime;
  }

  // Vérifier s'il y a un créneau libre après le dernier créneau occupé
  if (currentTime < workDayEnd) {
    freeSlots.push({
      start: currentTime.toISOString(),
      end: workDayEnd.toISOString(),
    });
  }

  // Si aucun créneau n'est libre, retourner "0"
  if (freeSlots.length === 0) {
    return res.status(200).json({ free_slots: "0" });
  }

  // Retourner les créneaux libres avec la date complète
  res.status(200).json({ free_slots: freeSlots });
});

// Route pour suggérer les trois premiers créneaux disponibles
app.post('/suggest-slots', (req, res) => {
  const { free_slots } = req.body;

  // Vérifier que les créneaux libres sont bien fournis
  if (!free_slots || !Array.isArray(free_slots) || free_slots.length === 0) {
    return res.status(400).json({ message: "Invalid input, 'free_slots' is required and should contain an array of slots." });
  }

  // Extraire les trois premiers créneaux disponibles
  const suggestedSlots = free_slots.slice(0, 3);

  // Retourner les créneaux suggérés
  res.status(200).json({ suggested_slots: suggestedSlots });
});

// Route pour étendre le créneau de +1 jour, en sautant le week-end
app.post('/extend-slots', (req, res) => {
  const { requested_datetime } = req.body;

  // Vérifier que la date/heure souhaitée est bien fournie
  if (!requested_datetime) {
    return res.status(400).json({ message: "Invalid input, 'requested_datetime' is required." });
  }

  // Traiter la date souhaitée sans fuseau horaire (en ajoutant 'Z' pour indiquer UTC)
  let requestedDate = new Date(`${requested_datetime}Z`);
  if (isNaN(requestedDate.getTime())) {
    return res.status(400).json({ message: "Invalid input, 'requested_datetime' must be a valid ISO date without timezone." });
  }

  // Étendre de +1 jour
  requestedDate.setUTCDate(requestedDate.getUTCDate() + 1);

  // Si J+1 tombe un samedi (6) ou un dimanche (0), avancer jusqu'au lundi
  while (requestedDate.getUTCDay() === 6 || requestedDate.getUTCDay() === 0) {
    requestedDate.setUTCDate(requestedDate.getUTCDate() + 1);
  }

  // Construire les créneaux d'ouverture (08:00 à 16:00) pour la nouvelle date
  const year = requestedDate.getUTCFullYear();
  const month = String(requestedDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(requestedDate.getUTCDate()).padStart(2, '0');
  const start = `${year}-${month}-${day}T08:00:00Z`;
  const end = `${year}-${month}-${day}T16:00:00Z`;

  // Retourner le créneau étendu
  res.status(200).json({ start, end });
});

// Route pour convertir les créneaux en UTC+1 et générer une phrase en français
app.post('/answer', (req, res) => {
  const { suggested_slots } = req.body;

  // Vérifier que les créneaux sont bien fournis
  if (!suggested_slots || !Array.isArray(suggested_slots) || suggested_slots.length === 0) {
    return res.status(400).json({ message: "Invalid input, 'suggested_slots' is required and should contain an array of slots." });
  }

  // Initialiser une chaîne pour construire la réponse en français
  let responseText = '';

  // Parcourir chaque créneau, le convertir en UTC+1, et formater la phrase
  suggested_slots.forEach((slot, index) => {
    const startDate = new Date(slot.start);
    const endDate = new Date(slot.end);

    // Convertir les heures de UTC à UTC+1
    const startUTCPlus1 = new Date(startDate.getTime() + 60 * 60 * 1000);
    const endUTCPlus1 = new Date(endDate.getTime() + 60 * 60 * 1000);

    // Extraire les informations nécessaires pour la phrase
    const day = String(startUTCPlus1.getUTCDate()).padStart(2, '0');
    const month = startUTCPlus1.toLocaleString('fr-FR', { month: 'long' });
    const startHour = startUTCPlus1.getUTCHours();
    const endHour = endUTCPlus1.getUTCHours();

    // Construire la phrase en français
    if (index === 0) {
      responseText += `le ${day} ${month} de ${startHour} heures à ${endHour} heures`;
    } else {
      responseText += ` et de ${startHour} heures à ${endHour} heures`;
    }
  });

  // Retourner la phrase générée
  res.status(200).send(responseText);
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
