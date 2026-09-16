const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory');
const Donor = require('../models/Donor');
const PatientRequest = require('../models/PatientRequest');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');
const { triggerSOS, processDonorResponse } = require('./sosService');
const { formatNigerianPhone, normalizePhone } = require('../utils/phone');
const { evaluateDonorEligibility } = require('../utils/eligibility');
const { getCompatibleDonors, compatibilityIndex } = require('../utils/bloodCompatibility');

// User session storage with 30-minute TTL to prevent memory leaks
const userSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

const bloodGroupOptions = {
  '1': 'A+', '2': 'A-', '3': 'B+', '4': 'B-',
  '5': 'AB+', '6': 'AB-', '7': 'O+', '8': 'O-'
};

const cityCoords = {
  ife: { lat: 7.4897, lon: 4.5421, name: 'Ile-Ife' },
  'ile-ife': { lat: 7.4897, lon: 4.5421, name: 'Ile-Ife' },
  'ile ife': { lat: 7.4897, lon: 4.5421, name: 'Ile-Ife' },
  osogbo: { lat: 7.7827, lon: 4.5418, name: 'Osogbo' },
  oshogbo: { lat: 7.7827, lon: 4.5418, name: 'Osogbo' },
  lagos: { lat: 6.5244, lon: 3.3792, name: 'Lagos' },
  ibadan: { lat: 7.3775, lon: 3.9470, name: 'Ibadan' },
  abuja: { lat: 9.0765, lon: 7.3986, name: 'Abuja' },
  akure: { lat: 7.2571, lon: 5.2058, name: 'Akure' },
  ilesa: { lat: 7.6292, lon: 4.7417, name: 'Ilesa' },
  ilesha: { lat: 7.6292, lon: 4.7417, name: 'Ilesa' },
  ede: { lat: 7.7397, lon: 4.4428, name: 'Ede' },
};

function getUserSession(phone) {
  const now = Date.now();
  let session = userSessions.get(phone);
  if (!session || now - session.lastSeen > SESSION_TTL_MS) {
    session = {
      step: null,
      lat: null,
      lon: null,
      hasLocation: false,
      lastSeen: now,
    };
    userSessions.set(phone, session);
  } else {
    session.lastSeen = now;
  }
  return session;
}

// Evict stale sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [phone, sess] of userSessions.entries()) {
    if (now - sess.lastSeen > SESSION_TTL_MS) userSessions.delete(phone);
  }
}, 15 * 60 * 1000).unref();

function getLocationPrompt() {
  return `📍 *SHARE YOUR LOCATION*

To find the nearest hospitals and eligible donors, please share your location:

📎 Tap the paperclip icon (or +) at the bottom
📍 Select *Location*
📲 Tap *Send your current location*

_💡 Or simply reply with your city name (e.g. "Ife", "Osogbo", "Lagos")._
_Type MENU to return._`;
}

function getMainMenu() {
  return `🩸 *SMART BLOOD BANK* 🏥

*MAIN MENU*

1️⃣ *BLOOD* – Find blood availability
2️⃣ *OXYGEN* – Find oxygen availability  
3️⃣ *DONOR* – Register as blood donor
4️⃣ *SOS* – Emergency donor alert
5️⃣ *TRACK* – Track request status
0️⃣ *HELP* – Commands & info

Reply with a number (1, 2, 3, 4, 5, or 0)`;
}

function getHelpGuide() {
  return `ℹ️ *HELP & COMMAND GUIDE* 🏥

Here are the fastest ways to use Smart Blood Bank:

🩸 *1. Find Blood:*
• Reply *1* and select your blood group
• Or use shortcut: *1 <group> <city>*
  _Example:_ *1 O+ Lagos* or *1 A- Ife*

🫧 *2. Find Oxygen:*
• Reply *2* to see cylinders available
• Or use shortcut: *2 <city>*
  _Example:_ *2 Lagos* or *2 Osogbo*

📋 *3. Track Your Request:*
• Reply *5* to find requests linked to your phone
• Or type: *TRACK <ID>* (e.g. *TRACK 3F8A1B*)

🚨 *4. Emergency SOS:*
• Reply *4* or type *SOS* to alert nearby compatible donors immediately

🩸 *5. Register as Donor:*
• Reply *3* and send: *Name, Blood Group, Phone*

📍 *Location Tips:*
• Tap 📎 (or +) ➔ *Location* ➔ *Send your current location* for nearest hospital ranking.
• Or reply with your city name (e.g. "Lagos", "Ife", "Abuja", "Osogbo").

Type *MENU* anytime to return to the Main Menu.`;
}

function formatRequestCard(r) {
  const rawStatus = (r.deliveryStatus || r.status || 'pending').toLowerCase();
  const statusEmoji = {
    pending: '⏳ PENDING (Matching in progress)',
    approved: '✅ APPROVED',
    'in-transit': '🚑 IN TRANSIT (On the way)',
    delivered: '📦 DELIVERED',
    fulfilled: '🎉 FULFILLED',
    cancelled: '🚫 CANCELLED',
    rejected: '❌ REJECTED',
  }[rawStatus] || rawStatus.toUpperCase();

  const ref = r._id.toString().slice(-6).toUpperCase();
  const allocated = r.allocatedHospitalId;
  const preferred = r.preferredHospitalId;
  const hospital = allocated || preferred;

  const quantity = r.units ?? r.unitsRequested ?? r.oxygenCylindersRequested ?? 1;
  const resourceDesc = r.resourceType === 'blood'
    ? `${quantity} unit(s) of ${r.bloodGroup || 'Blood'}`
    : `${quantity} cylinder(s) of Oxygen`;

  let card = `📋 *REQUEST #${ref}*\n`;
  card += `📌 Status: *${statusEmoji}*\n`;
  card += `🩺 Patient: ${r.patientName || 'Patient'}\n`;
  card += `🩸 Resource: ${resourceDesc}\n`;

  if (r.urgency) {
    const urgencyIcon = r.urgency === 'emergency' ? '🚨' : r.urgency === 'scheduled' ? '🗓️' : '⏱️';
    card += `${urgencyIcon} Urgency: *${r.urgency.toUpperCase()}*\n`;
  }

  if (allocated && allocated.name) {
    card += `🏥 Allocated Hospital: *${allocated.name}*\n`;
  } else if (preferred && preferred.name) {
    card += `🏥 Preferred Hospital: *${preferred.name}* _(Matching in progress)_\n`;
  } else {
    card += `🏥 Fulfilling Hospital: Pending Assignment\n`;
  }

  if (r.destinationFacility) {
    card += `📍 Destination: ${r.destinationFacility}`;
    if (r.ward) card += ` (Ward: ${r.ward}${r.bedNumber ? `, Bed: ${r.bedNumber}` : ''})`;
    card += `\n`;
  }

  if (hospital && hospital.contactPhone) {
    card += `📞 Hospital Phone: ${hospital.contactPhone}\n`;
  }

  if (hospital && hospital.location?.coordinates && hospital.location.coordinates.length >= 2) {
    card += `🗺️ Hospital Location: https://maps.google.com/?q=${hospital.location.coordinates[1]},${hospital.location.coordinates[0]}\n`;
  }

  if (r.deliveryAddress) {
    card += `🚚 Delivery: ${r.deliveryAddress}\n`;
  }
  const scheduled = r.scheduledTime || r.scheduledFor;
  if (scheduled) {
    card += `🗓️ Scheduled: ${new Date(scheduled).toLocaleString('en-GB')}\n`;
  }
  if (r.cancellationReason) {
    card += `⚠️ Cancellation: ${r.cancellationReason}\n`;
  }
  return card;
}

async function handleTrackingLookup(query, userPhone, session) {
  const cleaned = (query || '').trim();

  // If no query, try auto-matching phone digits
  if (!cleaned) {
    const senderDigits = userPhone.replace(/\D/g, '').slice(-10);
    if (senderDigits.length >= 10) {
      try {
        const phoneRegex = new RegExp(senderDigits + '$');
        const recent = await PatientRequest.find({ contactPhone: phoneRegex })
          .sort({ createdAt: -1 })
          .limit(2)
          .populate('allocatedHospitalId preferredHospitalId');

        if (recent.length > 0) {
          session.step = null;
          let reply = `🔍 *TRACKING YOUR REQUESTS*\n\nFound ${recent.length} recent request(s) linked to your number:\n\n`;
          reply += recent.map(formatRequestCard).join('\n---\n\n');
          reply += `\n_To check a different request, reply with its 6-character Reference ID or Phone Number._`;
          return reply;
        }
      } catch (err) {
        console.error('Auto-phone tracking error:', err);
      }
    }

    session.step = 'awaiting_tracking_query';
    return `🔍 *TRACK YOUR REQUEST*\n\nPlease reply with your *6-character Request ID* (e.g. 3F8A1B) or your *Contact Phone Number* (e.g. 08012345678):`;
  }

  try {
    let requests = [];

    if (mongoose.Types.ObjectId.isValid(cleaned) && cleaned.length === 24) {
      const match = await PatientRequest.findById(cleaned).populate('allocatedHospitalId preferredHospitalId');
      if (match) requests.push(match);
    }

    if (requests.length === 0 && /^[a-fA-F0-9]{4,24}$/.test(cleaned)) {
      const allRecent = await PatientRequest.find().sort({ createdAt: -1 }).limit(100).populate('allocatedHospitalId preferredHospitalId');
      const matched = allRecent.filter(r => r._id.toString().toLowerCase().endsWith(cleaned.toLowerCase()));
      if (matched.length > 0) requests.push(...matched);
    }

    if (requests.length === 0) {
      const digitsOnly = cleaned.replace(/\D/g, '');
      const searchDigits = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : digitsOnly;
      if (searchDigits.length >= 7) {
        const phoneRegex = new RegExp(searchDigits + '$');
        const matchedByPhone = await PatientRequest.find({ contactPhone: phoneRegex })
          .sort({ createdAt: -1 })
          .limit(3)
          .populate('allocatedHospitalId preferredHospitalId');
        requests.push(...matchedByPhone);
      }
    }

    if (requests.length === 0) {
      return `⚠️ *REQUEST NOT FOUND*\n\nWe couldn't find any request matching "${cleaned}".\n\nPlease verify your 6-character reference ID or 11-digit phone number and try again, or type *MENU*.`;
    }

    session.step = null;
    let reply = `🔍 *REQUEST STATUS*\n\n`;
    reply += requests.map(formatRequestCard).join('\n---\n\n');
    reply += `\n_Type MENU to return to main menu._`;
    return reply;
  } catch (err) {
    console.error('Tracking query error:', err);
    session.step = null;
    return `❌ An error occurred while retrieving your request. Please try again or type *MENU*.`;
  }
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
    return `⚠️ *NO ${bloodGroup} BLOOD AVAILABLE*\n\nNo hospital currently has ${bloodGroup} (or compatible) blood in stock.\n\nType *4* or *SOS* to broadcast an emergency donor alert.`;
  }

  const hasLoc = lat != null && lon != null;
  const anyCompatible = rankedHospitals.some((h) => h.compatibleDetails && h.compatibleDetails.length > 0);
  let message = `🩸 *${bloodGroup} BLOOD AVAILABILITY*\n\n`;
  if (hasLoc) message += `📍 Your location: ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n`;
  message += `*TOP RECOMMENDATIONS:*\n\n`;

  rankedHospitals.slice(0, 3).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    message += `${medal} *${h.name}*\n`;
    if (h.distance != null) message += `   📍 ${h.distance}km away\n`;
    if (h.exactUnits > 0) {
      message += `   🩸 *${h.exactUnits} unit(s)* of *${bloodGroup}* (exact match)\n`;
    }
    if (h.compatibleDetails && h.compatibleDetails.length > 0) {
      const compDesc = h.compatibleDetails.map((c) => `${c.units} ${c.group}`).join(', ');
      message += `   🔄 Compatible: ${compDesc}\n`;
    }
    message += `   📞 ${h.contactPhone || 'Call hospital'}\n`;
    if (h.coordinates && h.coordinates.length >= 2) {
      const destLat = h.coordinates[1];
      const destLon = h.coordinates[0];
      const mapsUrl = hasLoc
        ? `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${destLat},${destLon}`
        : `https://maps.google.com/?q=${destLat},${destLon}`;
      message += `   🗺️ Directions: ${mapsUrl}\n`;
    }
    message += `\n`;
  });

  if (anyCompatible) {
    message += `ℹ️ Groups marked *Compatible* are medically safe substitutes for ${bloodGroup}. Final crossmatching is verified by the hospital.\n\n`;
  }
  if (!hasLoc) message += `💡 Tip: Share your location (📎 → Location) to see nearest hospitals first.\n\n`;

  const webUrl = process.env.APP_URL || 'https://sbb-web.onrender.com';
  message += `📋 *Place Request Online:*\n${webUrl}/request\n\n`;
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
    message += `${i + 1}. *${h.name}*\n`;
    message += `   🔄 ${h.oxygenCylinderCount} cylinders ${fillIcon}\n`;
    message += `   📞 ${h.contactPhone || 'Call hospital'}\n`;
    if (h.coordinates && h.coordinates.length >= 2) {
      message += `   🗺️ Directions: https://maps.google.com/?q=${h.coordinates[1]},${h.coordinates[0]}\n`;
    }
    message += `\n`;
  });

  message += `_Type MENU for main menu_`;
  return message;
}

/**
 * Universal Dialog Engine. Handles incoming WhatsApp messages from both
 * Baileys (native WebSocket) and Twilio (HTTP webhook).
 *
 * @param {object} params
 * @param {string} params.fromPhone   Raw sender phone string
 * @param {string} [params.text]      Incoming text message body
 * @param {number} [params.latitude]  Optional latitude if pin was shared
 * @param {number} [params.longitude] Optional longitude if pin was shared
 * @returns {Promise<string>} The formatted bot reply
 */
async function handleIncomingMessage({ fromPhone, text = '', latitude = null, longitude = null }) {
  const userPhone = fromPhone.replace(/^whatsapp:/i, '').trim();
  const incomingMsg = (text || '').trim();
  const session = getUserSession(userPhone);

  console.log(`📱 [BotEngine] From: ${userPhone} | Msg: "${incomingMsg}" | Pin: (${latitude}, ${longitude})`);

  // 1. Menu Reset
  if (/^(menu|main menu|start)$/i.test(incomingMsg)) {
    session.step = null;
    return getMainMenu();
  }

  // 1b. Help / Commands Guide
  if (/^(help|info|commands|\?)$/i.test(incomingMsg)) {
    session.step = null;
    return getHelpGuide();
  }

  // 1c. Friendly Greetings
  if (/^(hi|hello|hey|test|good morning|good afternoon|good evening)$/i.test(incomingMsg)) {
    session.step = null;
    return `👋 Hello! Welcome to the Smart Blood Bank & Oxygen Hub.\n\n${getMainMenu()}`;
  }

  // 2. Direct TRACK / STATUS command
  const trackMatch = incomingMsg.match(/^(track|status)(\s+(.+))?$/i);
  if (trackMatch) {
    const query = trackMatch[3] ? trackMatch[3].trim() : null;
    return handleTrackingLookup(query, userPhone, session);
  }

  // 3. SOS Response from Donor (YES / NO)
  if (/^(yes|no|y|n)$/i.test(incomingMsg)) {
    try {
      const donorResponse = await processDonorResponse(userPhone, incomingMsg);
      return donorResponse.message;
    } catch (err) {
      console.error('Donor response error:', err);
      return `Thank you for your response. We will update your status.`;
    }
  }

  // 4. Shared WhatsApp GPS Location Pin
  if (latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
    session.lat = latitude;
    session.lon = longitude;
    session.hasLocation = true;

    if (session.step === 'awaiting_location_for_blood') {
      session.step = 'awaiting_blood_group';
      return `📍 Location saved!\n\n${getBloodGroupMenu()}`;
    }
    if (session.step === 'awaiting_location_for_sos') {
      session.step = 'awaiting_sos_blood_group';
      return `📍 Location saved!\n\n🚨 *SOS EMERGENCY* 🚨\n\nReply with the blood group needed (e.g., O+, A-, B+, AB-).`;
    }
    return `📍 Location saved! We'll use it to find the nearest blood and donors.\n\n${getMainMenu()}`;
  }

  // 5. In-Flow Location Step (Awaiting GPS or city name)
  if (session.step === 'awaiting_location_for_sos' || session.step === 'awaiting_location_for_blood') {
    const cleanCity = incomingMsg.toLowerCase().trim();
    if (cityCoords[cleanCity]) {
      const match = cityCoords[cleanCity];
      session.lat = match.lat;
      session.lon = match.lon;
      session.hasLocation = true;

      if (session.step === 'awaiting_location_for_sos') {
        session.step = 'awaiting_sos_blood_group';
        return `📍 Location set to *${match.name}*!\n\n🚨 *SOS EMERGENCY* 🚨\n\nReply with the blood group needed (e.g., O+, A-, B+, AB-).`;
      }
      session.step = 'awaiting_blood_group';
      return `📍 Location set to *${match.name}*!\n\n${getBloodGroupMenu()}`;
    }

    return `⚠️ *Location Needed*\n\nPlease do not reply with numbers.\n\n👉 Tap 📎 (paperclip or +) → *Location* → *Send Your Current Location*\n👉 Or reply with your city name (e.g., "Ife", "Osogbo", "Lagos")\n\n_Type MENU to return to main menu._`;
  }

  // 6. SOS Blood Group Selection
  if (session.step === 'awaiting_sos_blood_group') {
    const bloodMatch = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
    if (bloodMatch) {
      const bloodGroup = bloodMatch[0];
      const sosResult = await triggerSOS(bloodGroup, session.lat, session.lon, userPhone, 15);
      session.step = null;

      if (sosResult.donorsFound === 0) {
        return `⚠️ *NO DONORS AVAILABLE*\n\nNo compatible donors found within ${sosResult.radiusKm}km.\n\nPlease contact your nearest hospital directly.`;
      }
      const widened = sosResult.widened ? ` (search widened to ${sosResult.radiusKm}km to find donors)` : '';
      return `🚨 *SOS ALERT SENT* 🚨\n\n✅ ${sosResult.donorsAlerted} compatible donor(s) alerted within ${sosResult.radiusKm}km${widened}.\n\nWe'll message you here if a donor responds.\n\nFor immediate help, please contact your nearest hospital.`;
    }
    return `❌ Please reply with a valid blood group (e.g., O+, A-, B+, AB-):`;
  }

  // 7. Regular Blood Group Selection
  if (session.step === 'awaiting_blood_group') {
    let bloodGroup = null;
    if (incomingMsg.match(/^[1-8]$/)) {
      bloodGroup = bloodGroupOptions[incomingMsg];
    } else {
      const matched = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
      if (matched) bloodGroup = matched[0];
    }

    if (bloodGroup) {
      const compatibleGroups = getCompatibleDonors(bloodGroup);
      const searchGroups = compatibleGroups.length ? compatibleGroups : [bloodGroup];
      const hospitalsWithStock = await Inventory.aggregate([
        { $match: { resourceType: 'blood', bloodGroup: { $in: searchGroups }, units: { $gt: 0 } } },
        { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'hospital' } },
        { $unwind: '$hospital' }
      ]);

      if (hospitalsWithStock.length === 0) {
        session.step = null;
        return `⚠️ No ${bloodGroup} (or compatible) blood available in nearby hospitals.\n\nType 1 for another blood type, 4 or SOS for emergency alert, or MENU for main menu.`;
      }

      const hasLoc = session.hasLocation;
      const maxUnits = Math.max(...hospitalsWithStock.map((h) => h.units || 1), 1);

      const hospitalMap = new Map();
      for (const item of hospitalsWithStock) {
        const hid = item.hospital._id ? item.hospital._id.toString() : item.hospital.name;
        if (!hospitalMap.has(hid)) {
          let distance = null;
          let distanceScore = 0.5;
          if (hasLoc && item.hospital?.location?.coordinates && item.hospital.location.coordinates.length >= 2) {
            distance = haversineDistance(
              session.lat, session.lon,
              item.hospital.location.coordinates[1],
              item.hospital.location.coordinates[0]
            );
            distanceScore = getDistanceScore(distance);
          }

          hospitalMap.set(hid, {
            name: item.hospital.name,
            contactPhone: item.hospital.contactPhone,
            coordinates: item.hospital?.location?.coordinates || null,
            distance: distance != null ? distance.toFixed(1) : null,
            distanceScore,
            exactUnits: 0,
            compatibleDetails: [],
            totalUnits: 0,
            bestRank: 99,
            bestWps: 0,
          });
        }

        const entry = hospitalMap.get(hid);
        const isExact = item.bloodGroup === bloodGroup;
        const recencyScore = getRecencyScore(item.lastUpdatedAt);
        const stockScore = getStockScore(item.units, maxUnits);
        const idx = compatibilityIndex(bloodGroup, item.bloodGroup);
        const rank = idx === -1 ? 99 : idx;

        let wps;
        if (hasLoc && entry.distance != null) {
          wps = (0.40 * stockScore) + (0.35 * recencyScore) + (0.25 * entry.distanceScore);
        } else {
          wps = (0.60 * stockScore) + (0.40 * recencyScore);
        }

        if (isExact) {
          entry.exactUnits += item.units;
        } else {
          entry.compatibleDetails.push({ group: item.bloodGroup, units: item.units });
        }
        entry.totalUnits += item.units;
        if (rank < entry.bestRank) entry.bestRank = rank;
        if (wps > entry.bestWps) entry.bestWps = wps;
      }

      const ranked = Array.from(hospitalMap.values()).sort(
        (a, b) => a.bestRank - b.bestRank || b.bestWps - a.bestWps
      );

      session.step = null;
      return formatBloodResults(bloodGroup, ranked, hasLoc ? session.lat : null, hasLoc ? session.lon : null);
    }

    return `❌ Invalid blood group. Please reply with a number (1-8), type e.g. "O+", or MENU to start over.`;
  }

  // 8. Donor Registration
  if (session.step === 'awaiting_donor_registration') {
    const parts = incomingMsg.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    const bloodGroup = (parts[1] || '').toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/)?.[0] || null;
    const formattedPhone = formatNigerianPhone(parts[2]);

    if (parts.length < 3) {
      return `❌ Please send *Name, Blood Group, Phone* in one message.\n\nExample: John Doe, O+, 08012345678`;
    }
    if (!bloodGroup) {
      return `❌ "${parts[1]}" isn't a valid blood group. Use A+, A-, B+, B-, AB+, AB-, O+ or O-.`;
    }
    if (!formattedPhone) {
      return `❌ "${parts[2]}" isn't a valid Nigerian phone. Try e.g. 08012345678.`;
    }

    try {
      const existing = await Donor.findOne({ phone: formattedPhone });
      session.step = null;
      if (existing) {
        return `⚠️ A donor with ${formattedPhone} is already registered. Type *MENU* to continue.`;
      }
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
      return `✅ *Thank you, ${parts[0]}!*\n\nYou're registered as a *${bloodGroup}* donor. We'll alert you when someone nearby urgently needs your blood type. 🙏\n\nType *MENU* to return.`;
    } catch (err) {
      console.error('Donor registration error:', err.message);
      session.step = null;
      return `❌ Registration failed. Please try again or type MENU.`;
    }
  }

  // 9. Tracking Query
  if (session.step === 'awaiting_tracking_query') {
    return handleTrackingLookup(incomingMsg, userPhone, session);
  }

  // 10. Main Menu Number Options
  if (incomingMsg === '0') {
    session.step = null;
    return getHelpGuide();
  }

  if (incomingMsg === '1') {
    session.step = 'awaiting_blood_group';
    return getBloodGroupMenu();
  }

  if (incomingMsg === '2') {
    session.step = null;
    const oxygenData = await Inventory.aggregate([
      { $match: { resourceType: 'oxygen', oxygenCylinderCount: { $gt: 0 } } },
      { $group: {
          _id: '$hospitalId',
          cylinders: { $sum: '$oxygenCylinderCount' },
          fills: { $push: '$oxygenFillStatus' },
      } },
      { $lookup: { from: 'hospitals', localField: '_id', foreignField: '_id', as: 'hospital' } },
      { $unwind: '$hospital' },
      { $sort: { cylinders: -1 } },
    ]);

    const fillRank = { full: 3, partial: 2, empty: 1 };
    const formattedData = oxygenData.map((item) => {
      const bestFill = (item.fills || []).sort((a, b) => (fillRank[b] || 0) - (fillRank[a] || 0))[0] || 'empty';
      return {
        name: item.hospital.name,
        oxygenCylinderCount: item.cylinders,
        oxygenFillStatus: bestFill,
        contactPhone: item.hospital.contactPhone,
        coordinates: item.hospital?.location?.coordinates || null
      };
    });

    return formatOxygenResults(formattedData);
  }

  if (incomingMsg === '3') {
    session.step = 'awaiting_donor_registration';
    return `🩸 *BECOME A DONOR*\n\nReply with your details in one message:\n\n*Name, Blood Group, Phone*\n\nExample: John Doe, O+, 08012345678`;
  }

  if (incomingMsg === '4') {
    if (!session.hasLocation) {
      session.step = 'awaiting_location_for_sos';
      return getLocationPrompt();
    }
    session.step = 'awaiting_sos_blood_group';
    return `🚨 *SOS EMERGENCY* 🚨\n\nPlease reply with the blood group needed (e.g., O+, A-, B+, etc.)`;
  }

  if (incomingMsg === '5') {
    return handleTrackingLookup(null, userPhone, session);
  }

  // Default Fallback
  return getMainMenu();
}

module.exports = {
  handleIncomingMessage,
  getMainMenu,
  getHelpGuide,
  getLocationPrompt,
  getBloodGroupMenu,
  formatRequestCard,
  formatBloodResults,
  formatOxygenResults,
  handleTrackingLookup,
};
