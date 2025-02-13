const express = require('express');
const app = express();
const axios = require('axios');
const port = process.env.PORT || 10000;

// Middleware pour parser le JSON dans les requêtes
app.use(express.json());

// Route pour identifier les créneaux libres
app.post('/occupied-slots', (req, res) => {
  const { value: occupiedSlots } = req.body;

  // startHour et endHour peuvent être envoyés en string,
  // donc on les parse pour éviter l'erreur "must be numbers".
  let { startHour, endHour } = req.body;

  // Vérifier qu'on a au moins des slots
  if (!occupiedSlots || occupiedSlots.length === 0) {
    return res.status(400).json({
      message: "Invalid input, 'value' is required and should contain slots."
    });
  }

  // Convertir startHour/endHour en nombre (si c'est déjà un nombre, parseInt marche quand même)
  startHour = parseInt(startHour, 10);
  endHour   = parseInt(endHour, 10);

  // Vérifier qu'ils sont valides
  if (isNaN(startHour) || isNaN(endHour)) {
    return res.status(400).json({
      message: "Invalid input, 'startHour' and 'endHour' must be valid integers."
    });
  }

  // Récupérer la date (année/mois/jour) du premier slot
  const firstSlot = new Date(occupiedSlots[0].start); // ex. "2025-02-21T19:00:00Z"
  const year  = firstSlot.getFullYear();
  const month = firstSlot.getMonth();
  const day   = firstSlot.getDate();

  // Définir la plage de travail dynamique
  const workDayStart = new Date(year, month, day, startHour, 0, 0);
  const workDayEnd   = new Date(year, month, day, endHour, 0, 0);

  // Trier les créneaux occupés par ordre de début
  const sortedOccupiedSlots = occupiedSlots
    .map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end)
    }))
    .sort((a, b) => a.start - b.start);

  // Identifier les créneaux libres
  let freeSlots = [];
  let currentTime = workDayStart;

  for (const slot of sortedOccupiedSlots) {
    if (currentTime < slot.start) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end: slot.start.toISOString()
      });
    }
    if (slot.end > currentTime) {
      currentTime = slot.end;
    }
  }

  // S'il reste un créneau après le dernier slot occupé
  if (currentTime < workDayEnd) {
    freeSlots.push({
      start: currentTime.toISOString(),
      end: workDayEnd.toISOString()
    });
  }

  // Si aucun créneau libre, renvoyer "0"
  if (freeSlots.length === 0) {
    return res.status(200).json({ free_slots: "0" });
  }

  // Sinon, renvoyer les créneaux libres
  res.status(200).json({ free_slots: freeSlots });
});

// Route pour suggérer les trois premiers créneaux disponibles
app.post('/suggest-slots', (req, res) => {
  const { free_slots } = req.body;

  if (!free_slots || !Array.isArray(free_slots) || free_slots.length === 0) {
    return res.status(400).json({
      message: "Invalid input, 'free_slots' is required and should contain an array of slots."
    });
  }

  const suggestedSlots = free_slots.slice(0, 3);
  res.status(200).json({ suggested_slots: suggestedSlots });
});

// Route pour étendre le créneau de +1 jour, en sautant le week-end
app.post('/extend-slots', (req, res) => {
  const { requested_datetime } = req.body;

  if (!requested_datetime) {
    return res.status(400).json({
      message: "Invalid input, 'requested_datetime' is required."
    });
  }

  let requestedDate = new Date(`${requested_datetime}Z`);
  if (isNaN(requestedDate.getTime())) {
    return res.status(400).json({
      message: "Invalid input, 'requested_datetime' must be a valid ISO date without timezone."
    });
  }

  // Étendre de +1 jour
  requestedDate.setUTCDate(requestedDate.getUTCDate() + 1);

  // Si J+1 tombe un samedi ou dimanche, avancer jusqu'au lundi
  while (requestedDate.getUTCDay() === 6 || requestedDate.getUTCDay() === 0) {
    requestedDate.setUTCDate(requestedDate.getUTCDate() + 1);
  }

  const year  = requestedDate.getUTCFullYear();
  const month = String(requestedDate.getUTCMonth() + 1).padStart(2, '0');
  const day   = String(requestedDate.getUTCDate()).padStart(2, '0');
  const start = `${year}-${month}-${day}T08:00:00Z`;
  const end   = `${year}-${month}-${day}T16:00:00Z`;

  res.status(200).json({ start, end });
});

// Route pour convertir les créneaux en UTC+1 et générer une phrase en français
app.post('/answer', (req, res) => {
  const { suggested_slots } = req.body;

  if (!suggested_slots || !Array.isArray(suggested_slots) || suggested_slots.length === 0) {
    return res.status(400).json({
      message: "Invalid input, 'suggested_slots' is required and should contain an array of slots."
    });
  }

  let responseText = '';

  suggested_slots.forEach((slot, index) => {
    const startDate = new Date(slot.start);
    const endDate   = new Date(slot.end);

    // Convertir de UTC à UTC+1 (1 h)
    const startUTCPlus1 = new Date(startDate.getTime() + 60 * 60 * 1000);
    const endUTCPlus1   = new Date(endDate.getTime() + 60 * 60 * 1000);

    const day       = String(startUTCPlus1.getUTCDate()).padStart(2, '0');
    const month     = startUTCPlus1.toLocaleString('fr-FR', { month: 'long' });
    const startHour = startUTCPlus1.getUTCHours();
    const endHour   = endUTCPlus1.getUTCHours();

    if (index === 0) {
      responseText += `le ${day} ${month} de ${startHour} heures à ${endHour} heures`;
    } else {
      responseText += ` et de ${startHour} heures à ${endHour} heures`;
    }
  });

  res.status(200).send(responseText);
});

// Démarrer le serveur
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
