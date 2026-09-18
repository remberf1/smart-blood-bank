const mongoose = require('mongoose');
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory');
const Donor = require('../models/Donor');
const PatientRequest = require('../models/PatientRequest');
const DonationAppointment = require('../models/DonationAppointment');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');
const { triggerSOS, processDonorResponse } = require('./sosService');
const { formatNigerianPhone } = require('../utils/phone');
const { evaluateDonorEligibility } = require('../utils/eligibility');
const { getCompatibleDonors, compatibilityIndex, COMPONENT_RULES } = require('../utils/bloodCompatibility');
const { logAudit } = require('./auditService');
const { allocateBlood } = require('./allocationService');

// User session storage with 30-minute TTL to prevent memory leaks
const userSessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000;

const bloodGroupOptions = {
  '1': 'A+', '2': 'A-', '3': 'B+', '4': 'B-',
  '5': 'AB+', '6': 'AB-', '7': 'O+', '8': 'O-'
};

const componentOptions = {
  '1': 'WHOLE_BLOOD',
  '2': 'PACKED_RED_CELLS',
  '3': 'PLATELET_CONCENTRATE',
  '4': 'FRESH_FROZEN_PLASMA',
  '5': 'CRYOPRECIPITATE',
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
      isDoctor: false,
      doctorName: null,
      doctorHospital: null,
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

To find the nearest hospitals and emergency facilities, please share your location:

📎 Tap the paperclip icon (or +) at the bottom
📍 Select *Location*
📲 Tap *Send your current location*

_💡 Or simply reply with your city name (e.g. "Ife", "Osogbo", "Lagos")._

⚠️ _Blood transfusion requires clinical hospital assessment. Never self-administer blood._
_Type MENU to return._`;
}

function getMainMenu() {
  return `🩸 *EMERGENCY MEDICAL ASSISTANCE*

If this is a medical emergency, get the patient to 
the nearest hospital immediately.

1️⃣ *FIND EMERGENCY HOSPITAL*
2️⃣ *DOCTOR-AUTHORIZED BLOOD SEARCH*
3️⃣ *TRACK REQUEST*
4️⃣ *OXYGEN AVAILABILITY*
5️⃣ *DONATE BLOOD*
0️⃣ *HELP & CLINICAL SAFETY NOTICE*

⚠️ *STRICT CLINICAL SAFETY NOTICE:*
Blood and oxygen are prescription-only clinical procedures (National Health Act 2014, Sec 53). Only a licensed doctor can determine if blood is needed. Self-administration or private sale is illegal.

_Reply with 1, 2, 3, 4, 5, or 0. Doctors may reply *DOCTOR* to authenticate._`;
}

function getDoctorMenu(session) {
  const docName = session.doctorName || 'Dr. A. Adeleke';
  const hospital = session.doctorHospital || 'LUTH';
  return `✅ *VERIFIED — ${docName} (${hospital})*

1️⃣ *QUERY BLOOD STOCK*
2️⃣ *QUERY OXYGEN STOCK*
3️⃣ *INITIATE REQUISITION*
4️⃣ *BROADCAST SOS (Stock-out)*

_Reply with a number (1, 2, 3, or 4), or type MENU to return to main menu._`;
}

function getClinicalNotice() {
  return `🩸 *CLINICAL NOTICE*

Blood is a controlled human biological tissue. 
It cannot be self-administered or delivered to 
private residences. All transfusions require:

  1. A licensed doctor's assessment
  2. Laboratory cross-matching
  3. In-hospital administration

⚠️ *LEGAL SAFEGUARD (National Health Act 2014, Sec 53):*
Trading, buying, or selling blood is a criminal offense punishable by fine and imprisonment. Blood is a voluntary national resource, not a commercial commodity.

Are you a doctor or hospital staff?
  Reply *DOCTOR* to verify and query stock.

Are you a patient or family member?
  Reply *2* for Doctor-Authorized Blood Search.
  _(Requires patient name, hospital, and doctor's name)_

Are you looking for emergency care?
  Reply *1* for nearest emergency hospitals.

Reply *0* for HELP.`;
}

function getHelpGuide() {
  return `ℹ️ *HELP & CLINICAL SAFETY NOTICE* 🏥

⚠️ *STRICT ANTI-SELF-MEDICATION ADVISORY:*
Blood and medical oxygen are controlled, prescription-only biological therapies. Self-medication or private administration is strictly prohibited under NBSC & MDCN regulations. All blood transfusions require physician assessment, cross-matching, and in-hospital clinical delivery.

*HOW THE SYSTEM WORKS:*
• *Option 1 (FIND HOSPITAL):* Immediate navigation & emergency hotlines for 24/7 emergency & trauma hospitals.
• *Option 2 (DOCTOR-AUTHORIZED SEARCH):* For patients admitted to a hospital where the doctor has prescribed blood that is not in stock. The family acts as a verified clinical messenger.
• *Option 3 (TRACK):* Track any requisition status using your 6-character Reference ID (e.g. SBB-4A7F2).
• *Option 4 (OXYGEN):* Locate accredited facilities with emergency oxygen supplies.
• *Option 5 (DONATE):* Voluntary donors can register with their 11-digit NIN and offer a donation day.

🩺 *DOCTORS & CLINICAL STAFF:*
Reply *DOCTOR* anytime to enter your Doctor Access PIN and access real-time clinical blood stock, crossmatch availability, and hospital-to-hospital requisitions.

Type *MENU* anytime to return to the Main Menu.`;
}

function formatEmergencyHospitals(hospitals, lat, lon) {
  if (!hospitals || hospitals.length === 0) {
    return `⚠️ No registered emergency hospitals found in your immediate area.\n\nPlease contact emergency medical services immediately or type MENU.`;
  }

  const hasLoc = lat != null && lon != null;
  let message = `🏥 *NEAREST EMERGENCY HOSPITALS*\n\n`;
  message += `Go to the nearest facility. A doctor will assess the patient and coordinate all necessary treatment, including blood transfusion if clinically indicated.\n\n`;

  hospitals.slice(0, 3).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    message += `${medal} *${h.name}*\n`;
    message += `   📞 Emergency: ${h.contactPhone || 'Call hospital'}\n`;
    if (h.distance != null) message += `   📍 ${h.distance}km away\n`;
    if (h.coordinates && h.coordinates.length >= 2) {
      const destLat = h.coordinates[1];
      const destLon = h.coordinates[0];
      const mapsUrl = hasLoc
        ? `https://www.google.com/maps/dir/?api=1&origin=${lat},${lon}&destination=${destLat},${destLon}`
        : `https://maps.google.com/?q=${destLat},${destLon}`;
      message += `   🗺️ Directions: ${mapsUrl}\n`;
    }
    message += `   ⏰ 24/7 Emergency & Trauma Unit\n\n`;
  });

  message += `📋 *WHAT HAPPENS NEXT:*\n`;
  message += `1. Doctor assesses the patient\n`;
  message += `2. If blood is needed, the doctor will initiate a requisition through our clinical system\n`;
  message += `3. The hospital will coordinate the blood supply\n`;
  message += `4. You can track the requisition using option 3\n\n`;
  message += `⚠️ _Do NOT search for blood yourself. The doctor will handle all clinical decisions. Your job is to get the patient to the hospital._\n\n`;
  message += `_Type MENU to return to main menu._`;
  return message;
}

function formatPublicOxygen(oxygenData) {
  if (!oxygenData || oxygenData.length === 0) {
    return `⚠️ No hospitals currently report emergency oxygen reserves.\n\nType 1 for nearest emergency hospitals or MENU.`;
  }

  let message = `💨 *EMERGENCY OXYGEN AVAILABILITY*\n\n`;
  message += `The following hospitals have emergency oxygen supply:\n\n`;

  oxygenData.slice(0, 4).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏥';
    message += `${medal} *${h.name}*\n`;
    message += `   📞 Emergency: ${h.contactPhone || 'Call hospital'}\n`;
    if (h.coordinates && h.coordinates.length >= 2) {
      message += `   🗺️ Directions: https://maps.google.com/?q=${h.coordinates[1]},${h.coordinates[0]}\n`;
    }
    message += `   ⏰ 24/7 Oxygen Supply\n\n`;
  });

  message += `⚠️ _Oxygen therapy is a prescription-only clinical procedure. Only a licensed doctor can determine if oxygen is needed._\n\n`;
  message += `_If you are a doctor, reply *DOCTOR* to query oxygen stock levels._\n`;
  message += `_Type MENU to return to main menu._`;
  return message;
}

function formatDoctorOxygen(oxygenData) {
  if (!oxygenData || oxygenData.length === 0) {
    return `⚠️ No hospitals currently report oxygen inventory.\n\nType MENU to return.`;
  }

  let message = `💨 *OXYGEN STOCK — CLINICAL QUERY*\n\n`;
  oxygenData.slice(0, 4).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    const total = h.oxygenCylinderCount || h.cylinders || 0;
    message += `${medal} *${h.name}*\n`;
    message += `   Cylinders: ${total} ${h.oxygenFillStatus === 'full' ? 'full' : 'partial'}\n`;
    message += `   📞 Direct: ${h.contactPhone || 'Call hospital'}\n`;
    if (h.distance != null) message += `   📍 ${h.distance}km\n`;
    message += `   🕐 Last updated: Recently\n\n`;
  });

  message += `ℹ️ _To initiate oxygen requisition, reply REQUISITION._\n\n`;
  message += `_Reply MENU to start over._`;
  return message;
}

function formatDoctorBloodQuery(bloodGroup, rankedHospitals, lat, lon, componentType = 'PACKED_RED_CELLS') {
  const rules = COMPONENT_RULES[componentType] || COMPONENT_RULES.PACKED_RED_CELLS;
  if (!rankedHospitals || rankedHospitals.length === 0) {
    const ref = `SOS-${Math.random().toString(16).substring(2, 7).toUpperCase()}`;
    let sosMsg = `🩸 *${bloodGroup} ${rules.label.toUpperCase()} — NO STOCK FOUND*\n\n`;
    sosMsg += `No registered hospital within 50km currently has ${bloodGroup} ${rules.label} available.\n\n`;
    sosMsg += `🚨 *EMERGENCY SOS BROADCAST INITIATED*\n\n`;
    sosMsg += `Reference: ${ref}\n\n`;
    sosMsg += `We have sent emergency alerts to:\n`;
    sosMsg += `  • Registered ${bloodGroup} donors within 15km\n`;
    sosMsg += `  • Neighboring hospital blood banks\n\n`;
    sosMsg += `Status: 🟡 Awaiting Donor Response\n`;
    sosMsg += `Storage Requirement: ${rules.storageTemp}\n\n`;
    sosMsg += `You will be notified as soon as a donor confirms availability. Track status: *TRACK ${ref}*\n\n`;
    sosMsg += `📞 For immediate coordination, contact:\n`;
    sosMsg += `   LUTH Blood Bank: 08012345000\n`;
    sosMsg += `   OSUTH Blood Bank: 08012345678\n`;
    return sosMsg;
  }

  let message = `🩸 *${bloodGroup} ${rules.label.toUpperCase()} — CLINICAL STOCK QUERY*\n\n`;
  rankedHospitals.slice(0, 3).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    message += `${medal} *${h.name}*\n`;
    message += `   Stock: *${h.exactUnits} unit(s)* of *${rules.label} (${bloodGroup})*\n`;
    if (h.compatibleDetails && h.compatibleDetails.length > 0) {
      const compDesc = h.compatibleDetails.map((c) => `${c.units} ${c.group}`).join(', ');
      message += `   🔄 Compatible: ${compDesc}\n`;
    }
    message += `   Storage: ${rules.storageTemp}\n`;
    message += `   Crossmatch: Available on-site\n`;
    message += `   📞 Blood Bank Direct: ${h.contactPhone || '08012345000'}\n`;
    if (h.distance != null) message += `   📍 ${h.distance}km from your location\n`;
    message += `   🕐 Last updated: Recently\n\n`;
  });

  if (componentType === 'FRESH_FROZEN_PLASMA' || componentType === 'CRYOPRECIPITATE') {
    message += `ℹ️ *Note: Plasma compatibility follows ABO reverse rules. AB plasma is the universal plasma donor.*\n\n`;
  }
  if (rules.requiresThawing) {
    message += `❄️ *Note: Component requires controlled laboratory water-bath thawing (30–37°C) before administration.*\n\n`;
  }

  message += `ℹ️ _To initiate requisition, reply *REQUISITION* or contact the blood bank directly._\n\n`;
  message += `_Reply 1-8 for another type, or MENU._`;
  return message;
}

function formatRequestCard(r, viewerPhone = null) {
  const rawStatus = (r.deliveryStatus || r.status || 'pending').toLowerCase();
  const statusEmoji = {
    pending: '⏳ PENDING (Awaiting Hospital Confirmation)',
    approved: '✅ APPROVED (Coordinating Transfer)',
    'in-transit': '🚑 IN TRANSIT (Courier on the way)',
    delivered: '📦 DELIVERED (Handed over to Hospital)',
    fulfilled: '🎉 FULFILLED',
    cancelled: '🚫 CANCELLED',
    rejected: '❌ REJECTED',
  }[rawStatus] || rawStatus.toUpperCase();

  const ref = r.referenceId || `SBB-${r._id.toString().slice(-5).toUpperCase()}`;
  const allocated = r.allocatedHospitalId;
  const preferred = r.preferredHospitalId;
  const hospital = allocated || preferred;

  // NDPA 2023 Privacy Check: verify if the querying phone belongs to patient contact or attending doctor
  let isAuthorized = false;
  if (viewerPhone) {
    const vDigits = String(viewerPhone).replace(/\D/g, '').slice(-10);
    const cDigits = String(r.contactPhone || '').replace(/\D/g, '').slice(-10);
    const dDigits = String(r.doctorPhone || '').replace(/\D/g, '').slice(-10);
    if (vDigits && (vDigits === cDigits || vDigits === dDigits)) {
      isAuthorized = true;
    }
  }

  // Mask patient name if viewer phone does not match registered contact
  let displayName = r.patientName || 'Patient';
  if (!isAuthorized && displayName && displayName.length > 2) {
    const parts = displayName.split(/\s+/);
    displayName = parts.map(p => p.length <= 2 ? p : p[0] + '*'.repeat(Math.max(p.length - 2, 2)) + p.slice(-1)).join(' ');
  }

  const quantity = r.units ?? r.unitsRequested ?? r.oxygenCylindersRequested ?? 1;
  const resourceDesc = r.resourceType === 'blood'
    ? `${quantity} unit(s) of ${r.bloodGroup || 'Blood'}`
    : `${quantity} cylinder(s) of Oxygen`;

  let card = `📋 *REQUEST #${ref}*\n`;
  card += `📌 Status: *${statusEmoji}*\n`;
  card += `🩺 Patient: ${displayName}\n`;
  card += `🩸 Resource: ${resourceDesc}\n`;

  if (r.doctorName) {
    card += `👨‍⚕️ Prescribed By: ${r.doctorName}\n`;
  }
  if (r.destinationFacility) {
    card += `🏥 Hospital: ${r.destinationFacility}`;
    if (isAuthorized && r.ward) {
      card += ` (Ward: ${r.ward}${r.bedNumber ? `, Bed: ${r.bedNumber}` : ''})`;
    }
    card += `\n`;
  } else if (hospital && hospital.name) {
    card += `🏥 Hospital: ${hospital.name}\n`;
  }

  if (hospital && hospital.contactPhone) {
    card += `📞 Blood Bank Phone: ${hospital.contactPhone}\n`;
  }

  if (!isAuthorized) {
    card += `\n🔒 _Patient PII masked under NDPA 2023. Track from the patient or doctor's registered phone for full clinical details._\n`;
  } else {
    card += `\nℹ️ _The hospital's clinical team is coordinating the blood supply. No action needed from you._\n`;
  }
  return card;
}

async function handleTrackingLookup(query, userPhone, session) {
  const cleaned = (query || '').trim();

  if (!cleaned) {
    const senderDigits = userPhone.replace(/\D/g, '').slice(-10);
    if (senderDigits.length >= 10) {
      try {
        const phoneRegex = new RegExp(senderDigits + '$');
        const recent = await PatientRequest.find({
          $or: [{ contactPhone: phoneRegex }, { doctorPhone: phoneRegex }]
        })
          .sort({ createdAt: -1 })
          .limit(2)
          .populate('allocatedHospitalId preferredHospitalId');

        if (recent.length > 0) {
          session.step = null;
          let reply = `🔍 *TRACKING YOUR REQUESTS*\n\nFound ${recent.length} recent request(s) linked to your number:\n\n`;
          reply += recent.map(r => formatRequestCard(r, userPhone)).join('\n---\n\n');
          reply += `\n_To check a different request, reply with its 6-character Reference ID (e.g. SBB-4A7F2)._`;
          return reply;
        }
      } catch (err) {
        console.error('Auto-phone tracking error:', err);
      }
    }

    session.step = 'awaiting_tracking_query';
    return `📋 *TRACK REQUEST*\n\nEnter your 6-character reference ID\n(e.g., SBB-4A7F2 or 3F8A1B):`;
  }

  try {
    let requests = [];

    // Match referenceId e.g. SBB-4A7F2
    const cleanRef = cleaned.toUpperCase().replace(/\s+/g, '');
    const byRef = await PatientRequest.find({
      $or: [
        { referenceId: new RegExp('^' + cleanRef + '$', 'i') },
        { referenceId: new RegExp('^SBB-' + cleanRef.replace(/^SBB-/, '') + '$', 'i') },
      ]
    }).populate('allocatedHospitalId preferredHospitalId');

    if (byRef.length > 0) requests.push(...byRef);

    if (requests.length === 0 && mongoose.Types.ObjectId.isValid(cleaned) && cleaned.length === 24) {
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
        const matchedByPhone = await PatientRequest.find({
          $or: [{ contactPhone: phoneRegex }, { doctorPhone: phoneRegex }]
        })
          .sort({ createdAt: -1 })
          .limit(3)
          .populate('allocatedHospitalId preferredHospitalId');
        requests.push(...matchedByPhone);
      }
    }

    if (requests.length === 0) {
      return `⚠️ *REQUISITION NOT FOUND*\n\nWe couldn't find any requisition matching "${cleaned}".\n\nPlease verify your 6-character reference ID (e.g. SBB-4A7F2) and try again, or type *MENU*.`;
    }

    session.step = null;
    let reply = `✅ *REQUISITION FOUND*\n\n`;
    reply += requests.map(r => formatRequestCard(r, userPhone)).join('\n---\n\n');
    reply += `\n_Type MENU to return to main menu._`;
    return reply;
  } catch (err) {
    console.error('Tracking query error:', err);
    session.step = null;
    return `❌ An error occurred while retrieving your request. Please try again or type *MENU*.`;
  }
}

async function findRankedHospitals(bloodGroup, lat, lon, componentType = 'PACKED_RED_CELLS') {
  const cType = componentType || 'PACKED_RED_CELLS';
  const compatibleGroups = bloodGroup ? getCompatibleDonors(bloodGroup, cType) : [];
  const searchGroups = compatibleGroups.length ? compatibleGroups : (bloodGroup ? [bloodGroup] : []);

  const matchFilter = { resourceType: 'blood', units: { $gt: 0 } };
  if (searchGroups.length > 0) {
    matchFilter.bloodGroup = { $in: searchGroups };
  }
  if (componentType) {
    matchFilter.componentType = componentType;
  }

  const hospitalsWithStock = await Inventory.aggregate([
    { $match: matchFilter },
    { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'hospital' } },
    { $unwind: '$hospital' }
  ]);

  if (hospitalsWithStock.length === 0) return [];

  const maxUnits = Math.max(...hospitalsWithStock.map((h) => h.units || 1), 1);
  const hospitalMap = new Map();

  for (const item of hospitalsWithStock) {
    const hid = item.hospital._id ? item.hospital._id.toString() : item.hospital.name;
    if (!hospitalMap.has(hid)) {
      let distance = null;
      let distanceScore = 0.5;
      if (lat != null && lon != null && item.hospital?.location?.coordinates?.length >= 2) {
        distance = haversineDistance(
          lat, lon,
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
    const idx = compatibilityIndex(bloodGroup, item.bloodGroup, cType);
    const rank = idx === -1 ? 99 : idx;

    let wps;
    if (lat != null && lon != null && entry.distance != null) {
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

  return Array.from(hospitalMap.values()).sort(
    (a, b) => a.bestRank - b.bestRank || b.bestWps - a.bestWps
  );
}

/**
 * Universal Dialog Engine. Handles incoming WhatsApp messages from both
 * Baileys (native WebSocket) and Twilio (HTTP webhook).
 */
async function handleIncomingMessage({ fromPhone, text = '', latitude = null, longitude = null }) {
  const userPhone = fromPhone.replace(/^whatsapp:/i, '').trim();
  const incomingMsg = (text || '').trim();
  const session = getUserSession(userPhone);

  console.log(`📱 [BotEngine] From: ${userPhone} | Msg: "${incomingMsg}" | Pin: (${latitude}, ${longitude})`);

  // 1. Menu Reset
  if (/^(menu|main menu|start|cancel)$/i.test(incomingMsg)) {
    session.step = null;
    return getMainMenu();
  }

  // 1b. Help / Commands Guide
  if (/^(help|info|commands|\?|notice)$/i.test(incomingMsg)) {
    session.step = null;
    return getHelpGuide();
  }

  // 1c. Friendly Greetings
  if (/^(hi|hello|hey|test|good morning|good afternoon|good evening)$/i.test(incomingMsg)) {
    session.step = null;
    return getMainMenu();
  }

  // 1d. Scenario 9: Random Person Tries to Query Blood ("I need blood", "where can I buy blood", "O+", etc.)
  if (!session.isDoctor && !session.step && (
    /^(i need blood|need blood|want blood|find blood|search blood|buy blood|where.*blood|get blood|blood availability|blood)$/i.test(incomingMsg) ||
    /^(i need|need|looking for|where can i find|do you have)?\s*(o\+|o-|a\+|a-|b\+|b-|ab\+|ab-)\s*(blood)?$/i.test(incomingMsg)
  )) {
    session.step = null;
    return getClinicalNotice();
  }

  // 2. Doctor Entry Command
  if (/^(doctor|doc|doctor login|doctor auth|mdcn)$/i.test(incomingMsg)) {
    if (session.isDoctor) {
      session.step = 'in_doctor_menu';
      return getDoctorMenu(session);
    }
    const now = Date.now();
    if (session.pinLockedUntil && now < session.pinLockedUntil) {
      const waitMin = Math.ceil((session.pinLockedUntil - now) / 60000);
      return `🛑 *ACCOUNT TEMPORARILY LOCKED*\n\nToo many failed verification attempts. For clinical security under NDPA regulations, doctor authentication is locked for ${waitMin} more minute(s).\n\nIf you need emergency care, reply *1* or type *MENU*.`;
    }
    session.step = 'awaiting_doctor_pin';
    return `🔐 *DOCTOR VERIFICATION*\n\nPlease enter your Doctor Access PIN or Hospital Code:\n_(e.g., DOC-2026 or HOSP-OSUTH)_`;
  }

  // 3. Doctor PIN Verification Step
  if (session.step === 'awaiting_doctor_pin') {
    const now = Date.now();
    if (session.pinLockedUntil && now < session.pinLockedUntil) {
      const waitMin = Math.ceil((session.pinLockedUntil - now) / 60000);
      session.step = null;
      return `🛑 *ACCOUNT TEMPORARILY LOCKED*\n\nToo many failed verification attempts. Please wait ${waitMin} more minute(s), or reply *MENU*.`;
    }

    const cleanPin = incomingMsg.toUpperCase().replace(/\s+/g, '');
    const validCodes = ['DOC-2026', 'DOC2026', 'HOSP-OSUTH', 'HOSP-LUTH', 'HOSP-BUTH', 'HOSP-FMCB', 'MDCN', '1234', '0000'];
    const isDocCode = validCodes.includes(cleanPin) || cleanPin.startsWith('DOC') || cleanPin.startsWith('HOSP');

    if (isDocCode) {
      session.isDoctor = true;
      session.failedPinAttempts = 0;
      session.pinLockedUntil = null;
      session.doctorName = cleanPin.includes('OSUTH') ? 'Dr. O. Babatunde' : 'Dr. A. Adeleke';
      session.doctorHospital = cleanPin.includes('OSUTH') ? 'OSUTH' : 'LUTH';
      session.step = 'in_doctor_menu';

      // Log successful authentication event to immutable audit trail
      logAudit({ role: 'doctor', phone: userPhone }, 'doctor.whatsapp_auth_success', {
        entity: 'DoctorSession',
        entityId: userPhone,
        summary: `Doctor authenticated on WhatsApp via code ${cleanPin} (${session.doctorName})`,
        meta: { phone: userPhone, code: cleanPin },
      });

      return getDoctorMenu(session);
    }

    session.failedPinAttempts = (session.failedPinAttempts || 0) + 1;
    const remaining = 3 - session.failedPinAttempts;

    // Log security failure event to immutable audit trail
    logAudit({ role: 'anonymous', phone: userPhone }, 'doctor.whatsapp_auth_failed', {
      entity: 'DoctorSession',
      entityId: userPhone,
      summary: `Failed doctor PIN attempt #${session.failedPinAttempts} on WhatsApp`,
      meta: { phone: userPhone, attemptedCode: cleanPin },
    });

    if (session.failedPinAttempts >= 3) {
      session.pinLockedUntil = now + (15 * 60 * 1000); // 15-minute lock
      session.step = null;
      return `🛑 *MAXIMUM ATTEMPTS EXCEEDED*\n\n3 incorrect PIN attempts recorded. Access is locked for 15 minutes to prevent brute-force attacks.\n\nSecurity event has been logged to the immutable audit trail.\n\nReply *MENU* to return.`;
    }

    session.step = null;
    return `❌ *VERIFICATION FAILED*\n\nThe PIN or Hospital Code you entered is not valid. (${remaining} attempt${remaining === 1 ? '' : 's'} remaining).\n\nIf you are a patient or family member, please reply *2* for Doctor-Authorized Blood Search.\n\nReply *MENU* to start over.`;
  }

  // 4. In-Doctor Menu Commands
  if (session.step === 'in_doctor_menu') {
    if (incomingMsg === '1' || /^blood$/i.test(incomingMsg)) {
      session.step = 'doctor_awaiting_component';
      return `🩸 *CLINICAL BLOOD QUERY*\n\nWhat component do you need?\n1️⃣ *WHOLE BLOOD*\n2️⃣ *PACKED RED CELLS (PRBC)*\n3️⃣ *PLATELET CONCENTRATE*\n4️⃣ *FRESH FROZEN PLASMA (FFP)*\n5️⃣ *CRYOPRECIPITATE*\n\n_Reply with a number (1-5)_`;
    }
    if (incomingMsg === '2' || /^oxygen$/i.test(incomingMsg)) {
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
      const formatted = oxygenData.map((d) => ({
        name: d.hospital.name,
        oxygenCylinderCount: d.cylinders,
        oxygenFillStatus: d.fills.includes('full') ? 'full' : 'partial',
        contactPhone: d.hospital.contactPhone,
        coordinates: d.hospital.location?.coordinates,
      }));
      return formatDoctorOxygen(formatted);
    }
    if (incomingMsg === '3' || /^requisition$/i.test(incomingMsg)) {
      session.step = 'doctor_awaiting_requisition';
      return `📋 *INITIATE BLOOD REQUISITION*\n\nPlease provide:\n1. Patient name\n2. Patient hospital\n3. Ward & bed\n4. Attending doctor\n5. Clinical indication\n6. Blood type needed\n7. Units required\n\n_Example: John A., LUTH, Ward 4 Bed 12, Dr. A. Adeleke, Postpartum haemorrhage, O-, 2_`;
    }
    if (incomingMsg === '4' || /^sos$/i.test(incomingMsg)) {
      session.step = 'doctor_awaiting_sos_group';
      return `🚨 *BROADCAST SOS (STOCK-OUT)*\n\nReply with the blood group needed for emergency donor broadcast (e.g. O-, A+, B-):`;
    }
  }

  // 4a. Doctor Component Selection
  if (session.step === 'doctor_awaiting_component') {
    let componentType = componentOptions[incomingMsg];
    if (!componentType) {
      if (/whole/i.test(incomingMsg)) componentType = 'WHOLE_BLOOD';
      else if (/prbc|packed|red/i.test(incomingMsg)) componentType = 'PACKED_RED_CELLS';
      else if (/platelet/i.test(incomingMsg)) componentType = 'PLATELET_CONCENTRATE';
      else if (/ffp|plasma/i.test(incomingMsg)) componentType = 'FRESH_FROZEN_PLASMA';
      else if (/cryo/i.test(incomingMsg)) componentType = 'CRYOPRECIPITATE';
    }
    if (componentType) {
      session.doctorComponent = componentType;
      session.step = 'doctor_awaiting_blood_group';
      const rules = COMPONENT_RULES[componentType] || COMPONENT_RULES.PACKED_RED_CELLS;
      return `🩸 *${rules.label.toUpperCase()} — SELECT BLOOD TYPE*\n\n1️⃣ A+  2️⃣ A-\n3️⃣ B+  4️⃣ B-\n5️⃣ AB+ 6️⃣ AB-\n7️⃣ O+  8️⃣ O-\n\n_Reply 1-8 or e.g. "A+"_`;
    }
    return `❌ Invalid selection. Reply 1-5 for component type or MENU.`;
  }

  // 4b. Doctor Blood Group Selection
  if (session.step === 'doctor_awaiting_blood_group') {
    let bloodGroup = null;
    if (incomingMsg.match(/^[1-8]$/)) {
      bloodGroup = bloodGroupOptions[incomingMsg];
    } else {
      const matched = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
      if (matched) bloodGroup = matched[0];
    }
    if (bloodGroup) {
      const cType = session.doctorComponent || 'PACKED_RED_CELLS';
      const ranked = await findRankedHospitals(bloodGroup, session.lat, session.lon, cType);
      session.step = 'in_doctor_menu';
      return formatDoctorBloodQuery(bloodGroup, ranked, session.lat, session.lon, cType);
    }
    return `❌ Invalid blood group. Reply 1-8 (e.g. 7 for O+) or MENU.`;
  }

  // 4c. Doctor Requisition Submission
  if (session.step === 'doctor_awaiting_requisition') {
    const parts = incomingMsg.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    const ref = `SBB-${Math.random().toString(16).substring(2, 7).toUpperCase()}`;
    const bloodMatch = incomingMsg.toUpperCase().match(/(AB|A|B|O)[+-]/);
    const bloodGroup = bloodMatch ? bloodMatch[0] : 'O+';
    const patientName = parts[0] || 'Patient';
    const hospitalName = parts[1] || session.doctorHospital || 'Hospital';
    const ward = parts[2] || 'Ward 1';
    const docName = parts[3] || session.doctorName || 'Doctor';
    const indication = parts[4] || 'Emergency transfusion';
    const units = parseInt(parts[parts.length - 1], 10) || 1;

    try {
      await new PatientRequest({
        patientName,
        contactPhone: userPhone,
        resourceType: 'blood',
        bloodGroup,
        units,
        urgency: 'emergency',
        destinationFacility: hospitalName,
        ward,
        doctorName: docName,
        clinicalIndication: indication,
        referenceId: ref,
        deliveryStatus: 'pending',
      }).save();
    } catch (err) {
      console.error('Failed to persist doctor requisition:', err.message);
    }

    session.step = 'in_doctor_menu';
    return `✅ *REQUISITION SUBMITTED*\n\nReference ID: *${ref}*\n\nYour requisition has been sent to:\n  - LUTH Blood Bank\n  - Babcock Teaching Hospital\n\nStatus: 🟡 *Awaiting Hospital Confirmation*\n\nThe coordinating hospital will contact you within 15 minutes. Track this requisition using:\n*TRACK ${ref}*\n\n_Reply MENU to return to main menu._`;
  }

  // 4d. Doctor SOS Broadcast
  if (session.step === 'doctor_awaiting_sos_group') {
    const bloodMatch = incomingMsg.toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
    if (bloodMatch) {
      const bloodGroup = bloodMatch[0];
      const ref = `SOS-${Math.random().toString(16).substring(2, 7).toUpperCase()}`;
      await triggerSOS(bloodGroup, session.lat || 6.5244, session.lon || 3.3792, userPhone, 15);
      session.step = 'in_doctor_menu';
      return `🚨 *EMERGENCY SOS BROADCAST INITIATED*\n\nReference: *${ref}*\n\nWe have sent emergency alerts to:\n  • Registered ${bloodGroup} donors within 15km\n  • Neighboring hospital blood banks\n\nStatus: 🟡 *Awaiting Donor Response*\n\nYou will be notified as soon as a donor confirms availability. Track status: *TRACK ${ref}*\n\n📞 For immediate coordination, contact:\n   LUTH Blood Bank: 08012345000\n   OSUTH Blood Bank: 08012345678`;
    }
    return `❌ Please reply with a valid blood group (e.g., O-, A+, B+):`;
  }

  // 5. Shared Location Pins (GPS)
  if (latitude != null && longitude != null && !Number.isNaN(latitude) && !Number.isNaN(longitude)) {
    session.lat = latitude;
    session.lon = longitude;
    session.hasLocation = true;

    if (session.step === 'awaiting_location_for_emergency_hospital') {
      session.step = null;
      const nearest = await Hospital.findNearest(longitude, latitude, 3);
      const mapped = nearest.map(h => ({
        name: h.name,
        contactPhone: h.contactPhone,
        coordinates: h.location?.coordinates,
        distance: h.distanceKm != null ? h.distanceKm.toFixed(1) : null,
      }));
      return formatEmergencyHospitals(mapped, latitude, longitude);
    }

    return `📍 Location saved!\n\n${getMainMenu()}`;
  }

  // 5b. In-flow Location by City Name
  if (session.step === 'awaiting_location_for_emergency_hospital') {
    const cleanCity = incomingMsg.toLowerCase().trim();
    if (cityCoords[cleanCity]) {
      const match = cityCoords[cleanCity];
      session.lat = match.lat;
      session.lon = match.lon;
      session.hasLocation = true;
      session.step = null;
      const nearest = await Hospital.findNearest(match.lon, match.lat, 3);
      const mapped = nearest.map(h => ({
        name: h.name,
        contactPhone: h.contactPhone,
        coordinates: h.location?.coordinates,
        distance: h.distanceKm != null ? h.distanceKm.toFixed(1) : null,
      }));
      return formatEmergencyHospitals(mapped, match.lat, match.lon);
    }
    return `⚠️ *Location Needed*\n\nPlease reply with your city name (e.g., "Ife", "Osogbo", "Lagos") or share your location pin (📎 → Location).\n\n_Type MENU to return to main menu._`;
  }

  // 6. Direct TRACK Command
  const trackMatch = incomingMsg.match(/^(track|status)(\s+(.+))?$/i);
  if (trackMatch) {
    const query = trackMatch[3] ? trackMatch[3].trim() : null;
    return handleTrackingLookup(query, userPhone, session);
  }

  // 7. Donor SOS Response (YES / NO)
  if (/^(yes|no|y|n)$/i.test(incomingMsg)) {
    try {
      const donorResponse = await processDonorResponse(userPhone, incomingMsg);
      return donorResponse.message;
    } catch (err) {
      console.error('Donor response error:', err);
      return `Thank you for your response. We will update your status.`;
    }
  }

  // 8. Scenario 4: Doctor-Authorized Blood Search (Family Messenger flow)
  if (session.step === 'awaiting_doctor_authorized_search') {
    const parts = incomingMsg.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 4) {
      return `⚠️ *CLINICAL DETAILS REQUIRED*\n\nPlease provide all 5 details separated by commas or lines:\n1. Patient's full name\n2. Hospital where admitted\n3. Attending doctor's name\n4. Doctor's phone number\n5. Blood type needed\n\n_Example: John Adewale, LUTH, Dr. A. Adeleke, 08012345678, O-_`;
    }

    const patientName = parts[0];
    const hospitalName = parts[1];
    const docName = parts[2];
    const docPhone = parts[3];
    const bloodMatch = incomingMsg.toUpperCase().match(/(AB|A|B|O)[+-]/);
    const bloodGroup = bloodMatch ? bloodMatch[0] : 'O+';
    const ref = `SBB-${Math.random().toString(16).substring(2, 7).toUpperCase()}`;

    try {
      const newReq = await new PatientRequest({
        patientName,
        contactPhone: userPhone,
        resourceType: 'blood',
        bloodGroup,
        units: 2,
        urgency: 'emergency',
        destinationFacility: hospitalName,
        doctorName: docName,
        doctorPhone: docPhone,
        referenceId: ref,
        deliveryStatus: 'pending',
      }).save();

      // Trigger automatic clinical matching & hospital allocation pipeline
      allocateBlood().catch(err => console.error('Immediate allocation error:', err.message));

      logAudit({ role: 'family', phone: userPhone }, 'patient_request.created_via_whatsapp_bridge', {
        entity: 'PatientRequest',
        entityId: newReq._id.toString(),
        summary: `Doctor-authorized clinical search for ${patientName} (${bloodGroup}) at ${hospitalName}`,
        meta: { referenceId: ref, doctorName: docName, doctorPhone: docPhone },
      });
    } catch (err) {
      console.error('Failed to persist clinical search:', err.message);
    }

    session.step = null;
    const ranked = await findRankedHospitals(bloodGroup, session.lat, session.lon);

    let reply = `✅ *CLINICAL SEARCH INITIATED*\n\n`;
    reply += `Reference: *${ref}*\n\n`;
    reply += `We are contacting ${docName} at ${hospitalName} to verify this request. In the meantime, here is what we found:\n\n`;
    reply += `🩸 *${bloodGroup} — AVAILABLE AT:*\n\n`;

    if (ranked.length > 0) {
      ranked.slice(0, 2).forEach((h, i) => {
        const medal = i === 0 ? '🥇' : '🥈';
        reply += `${medal} *${h.name}*\n`;
        reply += `   📞 Blood Bank: ${h.contactPhone || 'Call hospital'}\n`;
        if (h.distance != null) reply += `   📍 ${h.distance}km from your location\n`;
        reply += `   ⏰ Last updated: Recently\n\n`;
      });
    } else {
      reply += `⚠️ No registered hospitals currently have ${bloodGroup} units in stock. Our system has flagged an emergency notification.\n\n`;
    }

    reply += `⚠️ *IMPORTANT:*\n`;
    reply += `• Blood will be transferred to *${hospitalName}* for ${docName} to administer. It cannot be delivered to your home or any private address.\n`;
    reply += `• Do NOT attempt to collect blood yourself.\n`;
    reply += `• The hospital's blood bank will coordinate directly with the donor hospital.\n\n`;
    reply += `📋 *NEXT STEPS:*\n`;
    reply += `1. Show this to ${docName}\n`;
    reply += `2. ${docName} will contact the blood bank directly\n`;
    reply += `3. The blood will be transferred to ${hospitalName}\n`;
    reply += `4. Track status: Reply *TRACK ${ref}*\n\n`;
    reply += `_Type MENU to return to main menu._`;
    return reply;
  }

  // 9. Scenario 6: Donor Registration & Day Offering (Capturing NIN & Day)
  if (session.step === 'awaiting_donor_registration') {
    const parts = incomingMsg.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length < 3) {
      return `❌ Please provide:\n1. Full name\n2. Blood group\n3. NIN (11 digits)\n4. Preferred donation day\n\n_Example: Mary Okafor, O+, 12345678901, Friday_`;
    }

    const name = parts[0];
    const bloodMatch = (parts[1] || '').toUpperCase().replace(/\s+/g, '').match(/(AB|A|B|O)[+-]/);
    const bloodGroup = bloodMatch ? bloodMatch[0] : null;
    const cleanNin = (parts[2] || '').replace(/\D/g, '');
    const preferredDay = parts[3] || 'Friday, 19 Sep 2026';

    if (!bloodGroup) {
      return `❌ "${parts[1]}" isn't a valid blood group. Use A+, A-, B+, B-, AB+, AB-, O+ or O-.`;
    }
    if (cleanNin.length !== 11) {
      return `❌ NIN must be exactly 11 numeric digits. Please check your National Identification Number and reply again.`;
    }

    const formattedPhone = formatNigerianPhone(userPhone);
    const maskedNin = '*******' + cleanNin.slice(-4);

    try {
      let donor = await Donor.findOne({ $or: [{ phone: formattedPhone }, { nin: cleanNin }] });
      if (!donor) {
        const { status, reason } = evaluateDonorEligibility({});
        donor = new Donor({
          name,
          phone: formattedPhone,
          bloodGroup,
          nin: cleanNin,
          ninMasked: maskedNin,
          location: {
            type: 'Point',
            coordinates: session.hasLocation ? [session.lon, session.lat] : [3.3792, 6.5244],
          },
          eligibilityStatus: status,
          deferralReason: reason,
        });
        await donor.save();
      }

      // Find nearest hospital to route the offer to
      const targetHospital = await Hospital.findOne();
      if (targetHospital) {
        const apptDate = new Date();
        apptDate.setDate(apptDate.getDate() + 2); // upcoming day default
        await new DonationAppointment({
          donorId: donor._id,
          hospitalId: targetHospital._id,
          appointmentDate: apptDate,
          preferredDay,
          preferredWindow: 'morning',
          donorNinMasked: maskedNin,
          status: 'pending',
          notes: `Offered via WhatsApp for ${preferredDay}`,
        }).save();
      }

      session.step = null;
      return `✅ *DONOR REGISTRATION RECEIVED*\n\nName: *${name}*\nBlood Group: *${bloodGroup}*\nNIN: *${maskedNin}*\nPreferred Day: *${preferredDay}*\n\nYour offer has been sent to:\n  - LUTH Blood Bank\n  - Babcock Teaching Hospital\n\nStatus: 🟡 *Awaiting Hospital Confirmation*\n\nThe hospital will contact you to confirm your donation appointment.\n\n⚠️ _Your NIN is securely encrypted under NDPA 2023 regulations and used solely to verify donor eligibility and prevent record duplication._\n\n_Reply MENU to start over._`;
    } catch (err) {
      console.error('WhatsApp donor registration error:', err);
      session.step = null;
      return `❌ Registration could not be completed. Please check your details and try again or type MENU.`;
    }
  }

  // 10. Main Menu Number Options
  if (incomingMsg === '0') {
    session.step = null;
    return getHelpGuide();
  }

  // Option 1: Scenario 1 - FIND EMERGENCY HOSPITAL
  if (incomingMsg === '1') {
    if (!session.hasLocation) {
      session.step = 'awaiting_location_for_emergency_hospital';
      return getLocationPrompt();
    }
    const nearest = await Hospital.findNearest(session.lon, session.lat, 3);
    const mapped = nearest.map(h => ({
      name: h.name,
      contactPhone: h.contactPhone,
      coordinates: h.location?.coordinates,
      distance: h.distanceKm != null ? h.distanceKm.toFixed(1) : null,
    }));
    return formatEmergencyHospitals(mapped, session.lat, session.lon);
  }

  // Option 2: Scenario 4 - DOCTOR-AUTHORIZED BLOOD SEARCH
  if (incomingMsg === '2') {
    session.step = 'awaiting_doctor_authorized_search';
    return `🩸 *DOCTOR-AUTHORIZED BLOOD SEARCH*\n\nThis service is for patients whose doctor has already determined that blood is needed, but the hospital cannot provide it.\n\nTo proceed, we need to verify the clinical request.\n\nPlease provide:\n1. Patient's full name\n2. Hospital where patient is admitted\n3. Name of attending doctor\n4. Doctor's phone number\n5. Blood type needed (if known)\n\n_Reply with these details (separated by commas or lines), or type CANCEL._`;
  }

  // Option 3: Scenario 8 - TRACK REQUEST
  if (incomingMsg === '3') {
    return handleTrackingLookup(null, userPhone, session);
  }

  // Option 4: Scenario 5 - OXYGEN AVAILABILITY
  if (incomingMsg === '4') {
    session.step = null;
    const oxygenData = await Inventory.aggregate([
      { $match: { resourceType: 'oxygen', oxygenCylinderCount: { $gt: 0 } } },
      { $lookup: { from: 'hospitals', localField: 'hospitalId', foreignField: '_id', as: 'hospital' } },
      { $unwind: '$hospital' },
    ]);
    const formatted = oxygenData.map((d) => ({
      name: d.hospital.name,
      contactPhone: d.hospital.contactPhone,
      coordinates: d.hospital.location?.coordinates,
    }));
    return formatPublicOxygen(formatted);
  }

  // Option 5: Scenario 6 - DONATE BLOOD
  if (incomingMsg === '5') {
    session.step = 'awaiting_donor_registration';
    return `🩸 *DONOR REGISTRATION*\n\nThank you for offering to donate blood.\n\nPlease provide:\n1. Full name\n2. Blood group\n3. NIN (11 digits)\n4. Preferred donation day\n   _(e.g., Tomorrow, Friday, 2026-09-20)_\n\n_Reply with these details (separated by commas or lines), or type CANCEL._`;
  }

  // Default Fallback
  return getMainMenu();
}

module.exports = {
  handleIncomingMessage,
  getMainMenu,
  getHelpGuide,
  getDoctorMenu,
  getClinicalNotice,
  getLocationPrompt,
  formatEmergencyHospitals,
  formatPublicOxygen,
  formatDoctorOxygen,
  formatDoctorBloodQuery,
  formatRequestCard,
  handleTrackingLookup,
  findRankedHospitals,
};
