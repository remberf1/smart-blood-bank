const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const Hospital = require('../models/Hospital');
const Inventory = require('../models/Inventory');
const Donor = require('../models/Donor');
const { haversineDistance, getDistanceScore, getRecencyScore, getStockScore } = require('../controllers/wpsEngine');
const { triggerSOS, processDonorResponse } = require('../services/sosService');

const MessagingResponse = twilio.twiml.MessagingResponse;

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
      lat: 7.7667,
      lon: 4.5667
    });
  }
  return userSessions.get(phone);
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
  
  let message = `🩸 *${bloodGroup} BLOOD AVAILABLE*\n\n`;
  message += `📍 Your location: ${lat.toFixed(4)}, ${lon.toFixed(4)}\n\n`;
  message += `*TOP RECOMMENDATIONS:*\n\n`;
  
  rankedHospitals.slice(0, 3).forEach((h, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    message += `${medal} *${h.name}*\n`;
    message += `   📍 ${h.distance}km away\n`;
    message += `   🩸 ${h.unitsAvailable} units available\n`;
    message += `   📞 ${h.contactPhone || 'Call hospital'}\n\n`;
  });
  
  message += `_Reply with 1-8 for another blood type_\n`;
  message += `_Or type MENU to start over_`;
  
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
router.post('/webhook', async (req, res) => {
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
  
  // Handle main menu numbers
  if (incomingMsg === '0') {
    session.step = null;
    twiml.message(getMainMenu());
  }
  else if (incomingMsg === '1') {
    session.step = 'awaiting_blood_group';
    twiml.message(getBloodGroupMenu());
  }
  else if (incomingMsg === '2') {
    session.step = null;
    const oxygenData = await Inventory.find({ 
      resourceType: 'oxygen',
      oxygenCylinderCount: { $gt: 0 }
    }).populate('hospitalId', 'name contactPhone');
    
    const formattedData = oxygenData.map(item => ({
      name: item.hospitalId.name,
      oxygenCylinderCount: item.oxygenCylinderCount,
      oxygenFillStatus: item.oxygenFillStatus,
      contactPhone: item.hospitalId.contactPhone
    }));
    
    twiml.message(formatOxygenResults(formattedData));
  }
  else if (incomingMsg === '3') {
    session.step = null;
    twiml.message(`🩸 *BECOME A DONOR*\n\nTo register as a blood donor, please reply with:\n\n📝 *Name*\n🩸 *Blood Group* (O+, A-, etc.)\n📱 *Phone*\n📍 *Location*\n\nExample: John Doe, O+, 08012345678, Oshogbo`);
  }
  // === SOS HANDLER ===
  else if (incomingMsg === '4') {
    session.step = 'awaiting_sos_blood_group';
    twiml.message(`🚨 *SOS EMERGENCY* 🚨\n\nPlease reply with the blood group needed (e.g., O+, A-, B+, etc.)`);
  }
  // Handle SOS blood group response
  else if (session.step === 'awaiting_sos_blood_group') {
    const bloodMatch = incomingMsg.toUpperCase().match(/[ABO]\+|[ABO]-/);
    if (bloodMatch) {
      const bloodGroup = bloodMatch[0];
      const sosResult = await triggerSOS(bloodGroup, session.lat, session.lon, userPhone.replace('whatsapp:', ''), 15);
      
      if (sosResult.donorsFound === 0) {
        twiml.message(`⚠️ *NO DONORS AVAILABLE*\n\nNo registered ${bloodGroup} donors found within ${sosResult.radiusKm}km.\n\nPlease contact your nearest hospital directly.`);
      } else {
        twiml.message(`🚨 *SOS ALERT SENT* 🚨\n\n✅ ${sosResult.donorsAlerted} ${bloodGroup} donors alerted within ${sosResult.radiusKm}km.\n\nWe will notify you if a donor responds.\n\nFor immediate help, please contact your nearest hospital.`);
      }
      session.step = null;
    } else {
      twiml.message(`❌ Please reply with a valid blood group (e.g., O+, A-, B+, AB-):`);
    }
  }
  // Handle blood group selection
  else if (session.step === 'awaiting_blood_group') {
    let bloodGroup = null;
    
    if (incomingMsg.match(/^[1-8]$/)) {
      bloodGroup = bloodGroupOptions[incomingMsg];
    } else {
      const matched = incomingMsg.toUpperCase().match(/[ABO]\+|[ABO]-/);
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
        const maxUnits = Math.max(...hospitalsWithStock.map(h => h.units));
        const scored = hospitalsWithStock.map(item => {
          const distance = haversineDistance(
            session.lat, session.lon,
            item.hospital.location.coordinates[1],
            item.hospital.location.coordinates[0]
          );
          const distanceScore = getDistanceScore(distance);
          const recencyScore = getRecencyScore(item.lastUpdatedAt);
          const stockScore = getStockScore(item.units, maxUnits);
          const wps = (0.40 * stockScore) + (0.35 * recencyScore) + (0.25 * distanceScore);
          
          return {
            name: item.hospital.name,
            contactPhone: item.hospital.contactPhone,
            distance: distance.toFixed(1),
            unitsAvailable: item.units,
            wps: wps
          };
        });
        
        const ranked = scored.sort((a, b) => b.wps - a.wps);
        const reply = formatBloodResults(bloodGroup, ranked, session.lat, session.lon);
        session.step = null;
        twiml.message(reply);
      }
    } else {
      twiml.message(`❌ Invalid blood group. Please reply with a number:\n\n1️⃣ A+    2️⃣ A-\n3️⃣ B+    4️⃣ B-\n5️⃣ AB+   6️⃣ AB-\n7️⃣ O+    8️⃣ O-`);
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