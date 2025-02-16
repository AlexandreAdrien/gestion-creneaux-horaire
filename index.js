const express = require('express');
const app = express();
const port = process.env.PORT || 10000;

app.use(express.json());

// Route pour identifier les créneaux libres
app.post('/occupied-slots', (req, res) => {
  let { value: occupiedSlots, requested_datetime, startHour, endHour } = req.body;

  // On convertit startHour / endHour si fournis
  let parsedStartHour = parseInt(startHour, 10);
  let parsedEndHour   = parseInt(endHour, 10);

  // 1) Si l'utilisateur fournit un requested_datetime, on déduit juste le jour
  let requestedDateObj = null;
  if (requested_datetime) {
    requestedDateObj = new Date(requested_datetime + 'Z');
    if (isNaN(requestedDateObj.getTime())) {
      return res.status(400).json({
        message: "Invalid input, 'requested_datetime' must be ISO (ex: 2025-02-17T09:00:00)."
      });
    }
  }

  // 2) Par défaut, la plage est 8h–19h si l'utilisateur ne l'a pas précisée
  if (isNaN(parsedStartHour)) {
    parsedStartHour = 7;
  }
  if (isNaN(parsedEndHour)) {
    parsedEndHour = 18;
  }

  // 3) Si on n'a pas de 'value' non vide,
  //    on crée un faux slot pour récupérer la date (année, mois, jour)
  //    soit depuis requested_datetime, soit on bloque si on n'a rien
  if (!occupiedSlots || occupiedSlots.length === 0) {
    if (!requestedDateObj) {
      return res.status(400).json({
        message: "Invalid input, provide either 'requested_datetime' or a non-empty 'value'."
      });
    }
    // Faux slot à la date demandée (0 min de durée)
    occupiedSlots = [{
      start: requestedDateObj.toISOString(),
      end:   requestedDateObj.toISOString()
    }];
  }

  // 4) On calcule l'année, mois, jour à partir du premier slot
  const firstSlot = new Date(occupiedSlots[0].start);
  if (isNaN(firstSlot.getTime())) {
    return res.status(400).json({
      message: "Invalid date in 'value[0].start' or 'requested_datetime'."
    });
  }

  const year  = firstSlot.getFullYear();
  const month = firstSlot.getMonth();
  const day   = firstSlot.getDate();

  // 5) Construire la plage 8h–19h (ou autre) de la journée
  const workDayStart = new Date(year, month, day, parsedStartHour, 0, 0);
  const workDayEnd   = new Date(year, month, day, parsedEndHour, 0, 0);

  // 6) Trier les slots occupés par ordre de début
  //    ET ignorer ceux qui ont start == end (durée zéro)
  const sortedOccupiedSlots = occupiedSlots
    .map(slot => ({
      start: new Date(slot.start),
      end:   new Date(slot.end)
    }))
    .filter(slot => slot.start < slot.end)  // <-- on ignore les slots vides
    .sort((a, b) => a.start - b.start);

  // 7) Trouver les créneaux libres
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

  // S'il reste du temps après le dernier slot occupé
  if (currentTime < workDayEnd) {
    freeSlots.push({
      start: currentTime.toISOString(),
      end:   workDayEnd.toISOString()
    });
  }

  // 8) Si aucun créneau libre, on renvoie "0"
  if (freeSlots.length === 0) {
    return res.status(200).json({ free_slots: "0" });
  }

  res.status(200).json({ free_slots: freeSlots });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
