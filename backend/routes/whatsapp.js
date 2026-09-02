const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory');
const Donor = require('../models/Donor');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');
const { triggerSOS, processDonorResponse } = require('../services/sosService');
const { formatNigerianPhone } = require('../utils/phone');
const { evaluateDonorEligibility } = require('../utils/eligibility');

const MessagingResponse = twilio.twiml.MessagingResponse;

// Validate that incoming webhook requests are genuinely from Twilio.
// Uses TWILIO_AUTH_TOKEN + the X-Twilio-Signature header. Set
// TWILIO_VALIDATE=false only for local testing without a public URL.
// If behind a proxy/ngrok, set TWILIO_WEBHOOK_URL to the exact public URL.
const validateTwilio =
  process.env.TWILIO_VALIDATE === 'false'
    ? (req, res, next) => next()
    : twilio.webhook(
        process.env.TWILIO_WEBHOOK_URL ? { url: process.env.TWILIO_WEBHOOK_URL } : {}
      );

// User session storage
const userSessions = new Map();

const bloodGroupOptions = {
  '1': 'A+', '2': 'A-', '3': 'B+', '4': 'B-',
  '5': 'AB+', '6': 'AB-', '7': 'O+', '8': 'O-'
};

function getUserSession(phone) {
  if (!userSessions.has(phone)) {
    userSessions.set(phone, {
      step: null,
      lat: null,
      lon: null,
      hasLocation: false, // set true once the user shares a WhatsApp location pin
    });
  }
  return userSessions.get(phone);
}

function getLocationPrompt() {
  return `📍 *SHARE YOUR LOCATION*

To find the nearest blood or donors, please share your location:

1️⃣ Tap 📎 (attach)
2️⃣ Choose *Location*
3️⃣ Send *Current location*

We use this only to rank results by distance.`;
}

function getMainMenu() {
  return `🩸 *SMART BLOOD BANK* 🏥

*MAIN MENU*

1️⃣ *BLOOD* – Find blood availability
2️⃣ *OXYGEN* – Find oxygen availability  
3️⃣ *DONOR* – Register as blood donor
4️⃣ *SOS* – Emergency donor alert
0️⃣ *HELP* – Commands & info

Reply with a number (1, 2, 3, 4, or 0)`;
}

function getBloodGroupMenu() {
  return `🩸 *BLOOD GROUP SELECTION*

Choose your blood type:

1️⃣ A+      2️⃣ A-
3️⃣ B+      4️⃣ B-
5️⃣ AB+     6️⃣ AB-
7️⃣ O+      8️⃣ O-

Reply with the number (1-8) or type e.g., "O+"`;
}

function formatBloodResults(bloodGroup, rankedHospitals, lat, lon) {
  if (!rankedHospitals || rankedHospitals.length === 0) {
    return `⚠️ *NO ${bloodGroup} BLOOD AVAILABLE*\n\nNo hospital has ${bloodGroup} blood right now.\n\nType *SOS* to alert nearby donors.`;
  }
  
  const hasLoc = lat != null && lon != null;
  let message = `🩸 *${bloodGroup} BLOOD AVAILABLE*\n\n`;
  if (hasLoc) message += `📍 Your location: ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n`;
  message += `*TOP RECOMMENDATIONS:*\n\n`;

  rankedHospitals.slice(0, 3).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    message += `${medal} *${h.name}*\n`;
    if (h.distance != null) message += `   📍 ${h.distance}km away\n`;
    message += `   🩸 ${h.unitsAvailable} units available\n`;
    message += `   📞 ${h.contactPhone || 'Call hospital'}\n\n`;
  });

  if (!hasLoc) message += `💡 Share your location (📎 → Location) to see the *nearest* hospitals first.\n\n`;
  message += `_Reply 1-8 for another blood type, or MENU to start over._`;

  return message;
}

function formatOxygenResults(oxygenData) {
  if (!oxygenData || oxygenData.length === 0) {
    return `⚠️ *NO OXYGEN AVAILABLE*\n\nNo hospitals have oxygen cylinders right now.\n\nType *SOS* for emergency assistance.`;
  }
  
  let message = `🫧 *OXYGEN AVAILABILITY*\n\n`;
  oxygenData.slice(0, 5).forEach((h, i) => {
    const fillIcon = h.oxygenFillStatus === 'full' ? '✅' : h.oxygenFillStatus === 'partial' ? '⚠️' : '❌';
    message += `${i+1}. *${h.name}*\n`;
    message += `   🔄 ${h.oxygenCylinderCount} cylinders ${fillIcon}\n`;
    message += `   📞 ${h.contactPhone || 'Call hospital'}\n\n`;
  });
  
  message += `_Type MENU for main menu_`;
  return message;
}

// Main webhook endpoint
router.post('/webhook', validateTwilio, async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = (req.body.Body || '').trim();
  const userPhone = req.body.From || '';
  
  console.log(`📱 From: ${userPhone}`);
  console.log(`💬 Message: ${incomingMsg}`);
  
  const session = getUserSession(userPhone);
  
  // Check for reset commands
  if (incomingMsg.toLowerCase() === 'menu' || incomingMsg.toLowerCase() === 'main menu' || incomingMsg.toLowerCase() === 'start') {
    session.step = null;
    twiml.message(getMainMenu());
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
    return;
  }
  
  // Handle donor YES/NO responses to SOS
  if (incomingMsg.match(/^(yes|no|y|n)$/i)) {
    try {
      const donorResponse = await processDonorResponse(userPhone.replace('whatsapp:', ''), incomingMsg);
      twiml.message(donorResponse.message);
    } catch (err) {
      console.error('Donor response error:', err);
      twiml.message(`Thank you for your response. We will update your status.`);
    }
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
    return;
  }

  // Handle a shared WhatsApp location pin (Body is empty for these messages)
  if (req.body.Latitude && req.body.Longitude) {
    const lat = parseFloat(req.body.Latitude);
    const lon = parseFloat(req.body.Longitude);
    if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
      session.lat = lat;
      session.lon = lon;
      session.hasLocation = true;

      if (session.step === 'awaiting_location_for_blood') {
        session.step = 'awaiting_blood_group';
        twiml.message(`📍 Location saved!\n\n${getBloodGroupMenu()}`);
      } else if (session.step === 'awaiting_location_for_sos') {
        session.step = 'awaiting_sos_blood_group';
        twiml.message(`📍 Location saved!\n\n🚨 *SOS EMERGENCY* 🚨\n\nReply with the blood group needed (e.g., O+, A-, B+).`);
      } else {
        twiml.message(`📍 Location saved! We'll use it to find the nearest blood and donors.\n\n${getMainMenu()}`);
      }
    } else {
      twiml.message(`❌ Could not read that location. Please try sharing your current location again.`);
    }
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
    return;
  }

  // In-flow steps take precedence over bare menu numbers, so a numeric blood
  // group (e.g. "1" = A+) isn't mistaken for main-menu option 1.
  if (session.step === 'awaiting_sos_blood_group') {
    const bloodMatch = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
    if (bloodMatch) {
      const bloodGroup = bloodMatch[0];
      const sosResult = await triggerSOS(bloodGroup, session.lat, session.lon, userPhone.replace('whatsapp:', ''), 15);

      if (sosResult.donorsFound === 0) {
        twiml.message(`⚠️ *NO DONORS AVAILABLE*\n\nNo compatible donors found within ${sosResult.radiusKm}km.\n\nPlease contact your nearest hospital directly.`);
      } else {
        const widened = sosResult.widened ? ` (search widened to ${sosResult.radiusKm}km to find donors)` : '';
        twiml.message(`🚨 *SOS ALERT SENT* 🚨\n\n✅ ${sosResult.donorsAlerted} compatible donor(s) alerted within ${sosResult.radiusKm}km${widened}.\n\nWe'll message you here if a donor responds.\n\nFor immediate help, please contact your nearest hospital.`);
      }
      session.step = null;
    } else {
      twiml.message(`❌ Please reply with a valid blood group (e.g., O+, A-, B+, AB-):`);
    }
  }
  else if (session.step === 'awaiting_blood_group') {
    let bloodGroup = null;

    if (incomingMsg.match(/^[1-8]$/)) {
      bloodGroup = bloodGroupOptions[incomingMsg];
    } else {
      const matched = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
      if (matched) bloodGroup = matched[0];
    }

    if (bloodGroup) {
      const hospitalsWithStock = await Inventory.aggregate([
        { $match: { resourceType: 'blood', bloodGroup: bloodGroup, units: { $gt: 0 } } },
        { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'hospital' } },
        { $unwind: '$hospital' }
      ]);

      if (hospitalsWithStock.length === 0) {
        twiml.message(`⚠️ No ${bloodGroup} blood available.\n\nType 1 for another blood type, SOS for emergency alert, or MENU for main menu.`);
      } else {
        const hasLoc = session.hasLocation;
        const maxUnits = Math.max(...hospitalsWithStock.map(h => h.units));
        const scored = hospitalsWithStock.map(item => {
          const recencyScore = getRecencyScore(item.lastUpdatedAt);
          const stockScore = getStockScore(item.units, maxUnits);

          let distance = null;
          let wps;
          if (hasLoc) {
            distance = haversineDistance(
              session.lat, session.lon,
              item.hospital.location.coordinates[1],
              item.hospital.location.coordinates[0]
            );
            const distanceScore = getDistanceScore(distance);
            wps = (0.40 * stockScore) + (0.35 * recencyScore) + (0.25 * distanceScore);
          } else {
            // No location: rank by stock + recency only.
            wps = (0.60 * stockScore) + (0.40 * recencyScore);
          }

          return {
            name: item.hospital.name,
            contactPhone: item.hospital.contactPhone,
            distance: distance != null ? distance.toFixed(1) : null,
            unitsAvailable: item.units,
            wps: wps
          };
        });

        const ranked = scored.sort((a, b) => b.wps - a.wps);
        const reply = formatBloodResults(bloodGroup, ranked, hasLoc ? session.lat : null, hasLoc ? session.lon : null);
        session.step = null;
        twiml.message(reply);
      }
    } else {
      twiml.message(`❌ Invalid blood group. Please reply with a number (1-8), type e.g. "O+", or MENU to start over.`);
    }
  }
  // Donor registration reply (Name, Blood Group, Phone)
  else if (session.step === 'awaiting_donor_registration') {
    const parts = incomingMsg.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const bloodGroup = (parts[1] || '').toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/)?.[0] || null;
    const formattedPhone = formatNigerianPhone(parts[2]);

    if (parts.length < 3) {
      twiml.message(`❌ Please send *Name, Blood Group, Phone* in one message.\n\nExample: John Doe, O+, 08012345678`);
    } else if (!bloodGroup) {
      twiml.message(`❌ "${parts[1]}" isn't a valid blood group. Use A+, A-, B+, B-, AB+, AB-, O+ or O-.`);
    } else if (!formattedPhone) {
      twiml.message(`❌ "${parts[2]}" isn't a valid Nigerian phone. Try e.g. 08012345678.`);
    } else {
      try {
        const existing = await Donor.findOne({ phone: formattedPhone });
        if (existing) {
          twiml.message(`⚠️ A donor with ${formattedPhone} is already registered. Type *MENU* to continue.`);
        } else {
          const { status, reason } = evaluateDonorEligibility({});
          await new Donor({
            name: parts[0],
            phone: formattedPhone,
            bloodGroup,
            location: {
              type: 'Point',
              coordinates: session.hasLocation ? [session.lon, session.lat] : [3.3792, 6.5244],
            },
            eligibilityStatus: status,
            deferralReason: reason,
          }).save();
          twiml.message(`✅ *Thank you, ${parts[0]}!*\n\nYou're registered as a *${bloodGroup}* donor. We'll alert you when someone nearby urgently needs your blood type. 🙏\n\nType *MENU* to return.`);
        }
        session.step = null;
      } catch (err) {
        console.error('WhatsApp donor registration error:', err.message);
        twiml.message(`❌ Sorry, registration failed. Please try again.`);
        session.step = null;
      }
    }
  }
  // Main menu numbers
  else if (incomingMsg === '0') {
    session.step = null;
    twiml.message(getMainMenu());
  }
  else if (incomingMsg === '1') {
    // Location is optional for blood search — it only improves distance ranking.
    session.step = 'awaiting_blood_group';
    twiml.message(getBloodGroupMenu());
  }
  else if (incomingMsg === '2') {
    session.step = null;
    // Aggregate oxygen per hospital so a hospital isn't listed multiple times.
    const oxygenData = await Inventory.aggregate([
      { $match: { resourceType: 'oxygen', oxygenCylinderCount: { $gt: 0 } } },
      { $group: {
          _id: '$hospitalId',
          cylinders: { $sum: '$oxygenCylinderCount' },
          fill: { $max: '$oxygenFillStatus' },
      } },
      { $lookup: { from: 'hospitals', localField: '_id', foreignField: '_id', as: 'hospital' } },
      { $unwind: '$hospital' },
      { $sort: { cylinders: -1 } },
    ]);

    const formattedData = oxygenData.map(item => ({
      name: item.hospital.name,
      oxygenCylinderCount: item.cylinders,
      oxygenFillStatus: item.fill,
      contactPhone: item.hospital.contactPhone
    }));

    twiml.message(formatOxygenResults(formattedData));
  }
  else if (incomingMsg === '3') {
    session.step = 'awaiting_donor_registration';
    twiml.message(`🩸 *BECOME A DONOR*\n\nReply with your details in one message:\n\n*Name, Blood Group, Phone*\n\nExample: John Doe, O+, 08012345678`);
  }
  // === SOS HANDLER ===
  else if (incomingMsg === '4') {
    // SOS needs the user's location to find nearby donors.
    if (!session.hasLocation) {
      session.step = 'awaiting_location_for_sos';
      twiml.message(getLocationPrompt());
    } else {
      session.step = 'awaiting_sos_blood_group';
      twiml.message(`🚨 *SOS EMERGENCY* 🚨\n\nPlease reply with the blood group needed (e.g., O+, A-, B+, etc.)`);
    }
  }
  // Unknown input
  else {
    twiml.message(getMainMenu());
  }
  
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

module.exports = router;