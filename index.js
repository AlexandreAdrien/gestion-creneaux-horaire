const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

// Middleware pour parser le JSON dans les requêtes
app.use(express.json());

// Route pour identifier les créneaux libres
app.post('/occupied-slots', (req, res) => {
  // On récupère :
  //  - un tableau "value" de slots occupés (optionnel si on fournit requested_datetime)
  //  - un "requested_datetime" (optionnel si on fournit déjà des slots)
  //  - la plage horaire (startHour / endHour) (optionnelle, sinon on la calcule)
  let { value: occupiedSlots, requested_datetime, startHour, endHour } = req.body;

  // On convertit (si présents) startHour / endHour en nombre
  let parsedStartHour = parseInt(startHour, 10);
  let parsedEndHour   = parseInt(endHour, 10);

  // Cas 1 : l'utilisateur fournit "requested_datetime"
  if (requested_datetime) {
    // On parse la date demandée
    const requestedDateObj = new Date(requested_datetime + 'Z');
    if (isNaN(requestedDateObj.getTime())) {
      return res.status(400).json({
        message: "Invalid input, 'requested_datetime' must be une date ISO valide (ex: 2025-02-21T19:00:00)."
      });
    }

    // Si l'utilisateur n'a pas spécifié startHour/endHour,
    // on les calcule automatiquement : (heure demandée) → (heure demandée +1)
    if (isNaN(parsedStartHour)) {
      parsedStartHour = requestedDateObj.getUTCHours(); // ex. 19 si 19h en UTC
    }
    if (isNaN(parsedEndHour)) {
      parsedEndHour = parsedStartHour + 1; // par défaut, +1 heure
    }

    // Si "value" (occupiedSlots) est vide ou inexistant,
    // on crée un faux slot (même heure début/fin) juste pour récupérer la date
    if (!occupiedSlots || occupiedSlots.length === 0) {
      occupiedSlots = [{
        start: requestedDateObj.toISOString(),
        end:   requestedDateObj.toISOString()
      }];
    }

  // Cas 2 : pas de requested_datetime => on attend un vrai tableau "value"
  } else {
    // On vérifie que startHour / endHour sont bien valides
    if (isNaN(parsedStartHour) || isNaN(parsedEndHour)) {
      return res.status(400).json({
        message: "Invalid input, 'startHour' et 'endHour' doivent être fournis ou alors 'requested_datetime'."
      });
    }
    if (!occupiedSlots || occupiedSlots.length === 0) {
      return res.status(400).json({
        message: "Invalid input, 'value' (slots) ne peut pas être vide si pas de 'requested_datetime'."
      });
    }
  }

  // À ce stade, on a forcément un tableau occupiedSlots et des heures start/end
  startHour = parsedStartHour;
  endHour   = parsedEndHour;

  // Récupérer l'année, mois, jour depuis le 1er slot
  const firstSlot = new Date(occupiedSlots[0].start);
  if (isNaN(firstSlot.getTime())) {
    return res.status(400).json({
      message: "Invalid date dans 'value[0].start' ou 'requested_datetime'."
    });
  }

  const year  = firstSlot.getFullYear();
  const month = firstSlot.getMonth();
  const day   = firstSlot.getDate();

  // Créer la plage de travail [startHour → endHour] pour ce jour
  const workDayStart = new Date(year, month, day, startHour, 0, 0);
  const workDayEnd   = new Date(year, month, day, endHour, 0, 0);

  // Trier les créneaux occupés par ordre de début
  const sortedOccupiedSlots = occupiedSlots
    .map(slot => ({
      start: new Date(slot.start),
      end:   new Date(slot.end)
    }))
    .sort((a, b) => a.start - b.start);

  // Identifier les créneaux libres
  let freeSlots = [];
  let currentTime = workDayStart;

  for (const slot of sortedOccupiedSlots) {
    if (currentTime < slot.start) {
      freeSlots.push({
        start: currentTime.toISOString(),
        end:   slot.start.toISOString()
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
      end:   workDayEnd.toISOString()
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
      message: "Invalid input, 'requested_datetime' must be a valid ISO date (ex: 2025-02-21T19:00:00)."
    });
  }

  // Étendre de +1 jour
  requestedDate.setUTCDate(requestedDate.getUTCDate() + 1);

  // Si J+1 tombe un samedi ou dimanche, avancer jusqu'au lundi
  while (requestedDate.getUTCHours() === 6 || requestedDate.getUTCHours() === 0) {
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

    // Convertir de UTC à UTC+1 (1h)
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
