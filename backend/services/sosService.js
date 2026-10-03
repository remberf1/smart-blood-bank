require('dotenv').config();
const twilio = require('twilio');
const Donor = require('../models/Donor');
const SOSRequest = require('../models/SOSRequest');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const { normalizePhone, formatNigerianPhone } = require('../utils/phone');
const { getCompatibleDonors } = require('../utils/bloodCompatibility');
const { sendEmail, buildSosAlertEmail, buildDonorSosEmail } = require('./notificationService');

// Email the admins of hospitals near an SOS so they can mobilise stock. Best-
// effort and never throws — admin alerting must not break the SOS itself.
async function alertNearbyHospitalAdmins(bloodGroup, lat, lon, radiusKm, options = {}) {
  try {
    const isPublic = options.tier === 'public';
    let nearby = [];
    if (lat != null && lon != null) {
      try {
        nearby = await Hospital.find({
          location: {
            $near: {
              $geometry: { type: 'Point', coordinates: [lon, lat] },
              $maxDistance: radiusKm * 1000, // km -> metres
            },
          },
        }).select('_id').limit(15);
      } catch (geoErr) {
        console.warn('Geospatial hospital lookup warning:', geoErr.message);
      }
    }

    // Alert admins associated with nearby hospitals OR system superadmins.
    let adminQuery = {
      role: { $in: ['admin', 'superadmin'] },
      isActive: true,
    };
    if (nearby.length > 0) {
      adminQuery = {
        isActive: true,
        $or: [
          { role: 'admin', hospitalId: { $in: nearby.map((h) => h._id) } },
          { role: 'superadmin' },
        ],
      };
    }

    const admins = await User.find(adminQuery).select('email');
    if (admins.length > 0) {
      const e = buildSosAlertEmail({ bloodGroup, radiusKm, lat, lon });
      for (const a of admins) {
        if (a.email) sendEmail(a.email, isPublic ? `[PUBLIC BYSTANDER SOS] ${e.subject}` : e.subject, e.text, e.html).catch(() => {});
      }
      console.log(`📧 SOS: alerted ${admins.length} hospital admin/superadmin(s) near the request (tier: ${options.tier || 'clinical'})`);
    }

    // If an admin WhatsApp phone is configured in .env, send a direct WhatsApp alert too
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (adminPhone) {
      const mapUrl = lat != null && lon != null ? `https://www.google.com/maps?q=${lat},${lon}` : null;
      const alertHeader = isPublic
        ? `🚨 *PUBLIC BYSTANDER SOS — TRIAGE REQUIRED* 🚨\n\nA bystander requested *${bloodGroup}* blood.`
        : `🚨 *ADMIN ALERT — CLINICAL SOS* 🚨\n\nAn authorized clinical emergency SOS for *${bloodGroup}* blood was triggered.`;

      await dispatchWhatsAppMessage(
        adminPhone,
        `${alertHeader}\n\n📍 Location: ${mapUrl || 'N/A'}\n📞 Caller Phone: ${options.userPhone || 'N/A'}\n${isPublic ? '⚠️ Please contact caller for triage: /dashboard/sos' : 'Eligible donors are being alerted: /dashboard/sos'}`
      ).catch((err) => console.warn('Admin WhatsApp SOS dispatch warning:', err.message));
    }
  } catch (err) {
    console.error('SOS admin alert failed:', err.message);
  }
}

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_NUMBER;

const ENABLED =
  process.env.NOTIFICATIONS_ENABLED !== 'false' &&
  Boolean(SID && TOKEN && FROM && SID.startsWith('AC'));

let client = null;
if (ENABLED) {
  try {
    client = twilio(SID, TOKEN);
  } catch (err) {
    console.error('Twilio init failed; SOS alerts disabled:', err.message);
  }
}

async function dispatchWhatsAppMessage(phone, body) {
  const provider = process.env.WHATSAPP_PROVIDER || 'baileys';

  // 1. Try Baileys first if configured and connected
  if (provider === 'baileys') {
    try {
      const baileysService = require('./baileysService');
      const status = baileysService.getStatus();
      if (status.connected) {
        const res = await baileysService.sendMessage(phone, body);
        if (res.sent) return res;
        console.warn(`[Baileys SOS dispatch failed, trying Twilio fallback]:`, res.error || res.reason);
      }
    } catch (e) {}
  }

  // 2. Fall back to Twilio
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone) return { sent: false, reason: 'no-phone' };

  if (client) {
    try {
      const msg = await client.messages.create({
        from: FROM,
        to: `whatsapp:${cleanPhone}`,
        body,
      });
      return { sent: true, sid: msg.sid };
    } catch (err) {
      return { sent: false, reason: 'error', error: err.message };
    }
  }
  return { sent: false, reason: 'unconfigured' };
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

async function triggerSOS(bloodGroup, userLat, userLon, userPhone, radiusKm = 15, extraData = {}) {
  const isPublicTier = extraData.tier === 'public';
  const tier = isPublicTier ? 'public' : 'clinical';

  console.log(`🚨 SOS TRIGGERED [${tier.toUpperCase()} TIER]: ${bloodGroup} needed at (${userLat}, ${userLon})`);
  console.log('Using Twilio from number:', process.env.TWILIO_WHATSAPP_NUMBER);

  // Generate a clean trackable reference ID if not supplied
  const referenceId = extraData.referenceId || `SOS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // Compute nearest hospital up front so caller and triage teams have it immediately
  let nearestHospital = null;
  if (userLat != null && userLon != null) {
    try {
      const hospitals = await Hospital.find({
        'location.coordinates': { $exists: true, $ne: [] },
      }).select('name address contactPhone location');
      if (hospitals.length > 0) {
        const withDist = hospitals
          .map((h) => {
            const coords = h.location?.coordinates || [];
            const dist = coords.length >= 2 ? haversineDistance(userLat, userLon, coords[1], coords[0]) : null;
            return {
              id: h._id,
              name: h.name,
              address: h.address,
              phone: h.contactPhone,
              distanceKm: dist != null ? Math.round(dist * 10) / 10 : null,
              coordinates: coords,
            };
          })
          .filter((h) => h.distanceKm != null)
          .sort((a, b) => a.distanceKm - b.distanceKm);
        nearestHospital = withDist[0] || null;
      }
    } catch (hospErr) {
      console.warn('Error locating nearest hospital in SOS:', hospErr.message);
    }
  }

  // ==============================================================
  // TIER 2: PUBLIC / BYSTANDER SOS (UNVERIFIED)
  // Does NOT broadcast to voluntary donors directly.
  // Routes to nearest hospital emergency triage & ambulance dispatch.
  // ==============================================================
  if (isPublicTier) {
    const sos = new SOSRequest({
      bloodGroup,
      referenceId,
      tier: 'public',
      authCode: undefined,
      hospitalTriageStatus: 'pending_verification',
      userLocation: { lat: userLat, lon: userLon },
      userPhone: normalizePhone(userPhone),
      radiusKm,
      status: 'pending',
    });
    await sos.save();

    // Alert nearest hospital admins and emergency teams for immediate triage
    alertNearbyHospitalAdmins(bloodGroup, userLat, userLon, radiusKm, {
      tier: 'public',
      userPhone: normalizePhone(userPhone),
    });

    console.log(`🏥 Public SOS created: ${referenceId} -> Routed to nearest hospital (${nearestHospital?.name || 'Local'}) for triage`);

    return {
      sosId: sos._id,
      referenceId: sos.referenceId,
      tier: 'public',
      bloodGroup,
      userLocation: { lat: userLat, lon: userLon },
      radiusKm,
      widened: false,
      donorsFound: 0,
      donorsAlerted: 0,
      nearestHospital,
      message: 'Nearest hospital emergency department has been alerted for clinical triage. Please call them directly or stand by for contact.',
    };
  }

  // ==============================================================
  // TIER 1: CLINICAL SOS (VERIFIED VIA DOCTOR PIN OR FACILITY CODE)
  // Broadcasts immediately to compatible voluntary donors within radius.
  // ==============================================================
  const compatibleGroups = getCompatibleDonors(bloodGroup);
  const targetGroups = compatibleGroups.length ? compatibleGroups : [bloodGroup];
  const donors = await Donor.find({
    isVerified: { $ne: false },
    $or: [
      { bloodGroupVerified: { $in: targetGroups }, bloodGroupVerificationStatus: 'verified' },
      { bloodGroup: { $in: targetGroups }, bloodGroupVerificationStatus: 'verified' },
    ],
    eligibilityStatus: 'eligible',
    sosOptIn: true,
  });

  const withDistance = donors
    .map(donor => ({
      ...donor.toObject(),
      distance: haversineDistance(
        userLat, userLon,
        donor.location.coordinates[1],
        donor.location.coordinates[0]
      ),
    }))
    .sort((a, b) => a.distance - b.distance);

  const tiers = Array.from(new Set([radiusKm, 50, 150].filter((r) => r >= radiusKm)))
    .sort((a, b) => a - b);
  let effectiveRadius = radiusKm;
  let donorsWithDistance = [];
  for (const r of tiers) {
    effectiveRadius = r;
    donorsWithDistance = withDistance.filter((d) => d.distance <= r);
    if (donorsWithDistance.length > 0) break;
  }

  console.log(`📍 Found ${donorsWithDistance.length} eligible donors within ${effectiveRadius}km`);

  const sos = new SOSRequest({
    bloodGroup,
    referenceId,
    tier: 'clinical',
    authCode: extraData.authCode,
    hospitalTriageStatus: 'verified_broadcasted',
    doctorName: extraData.doctorName || undefined,
    doctorPhone: extraData.doctorPhone ? normalizePhone(extraData.doctorPhone) : undefined,
    hospitalName: extraData.hospitalName || undefined,
    componentNeeded: extraData.componentNeeded || 'WHOLE_BLOOD',
    userLocation: { lat: userLat, lon: userLon },
    userPhone: normalizePhone(userPhone),
    radiusKm: effectiveRadius,
    status: 'pending',
  });

  let alertedCount = 0;
  for (const donor of donorsWithDistance) {
    const donorPhone = normalizePhone(donor.phone);
    try {
      console.log(`📨 Sending SOS to: ${donorPhone}`);
      const body = `🚨 *URGENT CLINICAL SOS - BLOOD DONATION NEEDED* 🚨\n\nA verified patient near you urgently needs *${bloodGroup}* blood — your *${donor.bloodGroup}* is a match.\n\n📍 Distance: ${donor.distance.toFixed(1)}km from you\n\nIf you are available to donate, please reply with *YES* or *NO*.\n\nThank you for potentially saving a life! 🙏`;

      const dispatchResult = await dispatchWhatsAppMessage(donorPhone, body);
      if (dispatchResult.sent) {
        sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'alerted' });
        alertedCount++;
        console.log(`✅ SOS WhatsApp sent to: ${donorPhone}`);
      } else {
        sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'failed' });
      }

      if (donor.email) {
        const emailData = buildDonorSosEmail({
          donorName: donor.name,
          donorGroup: donor.bloodGroup,
          bloodGroup,
          distanceKm: donor.distance,
          lat: userLat,
          lon: userLon,
        });
        sendEmail(donor.email, emailData.subject, emailData.text, emailData.html).catch(() => {});
      }

      await Donor.updateOne(
        { _id: donor._id },
        { $inc: { sosAlertCount: 1 }, $set: { lastSosAlert: new Date() } }
      );
    } catch (err) {
      sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'failed' });
    }
  }

  await sos.save();

  alertNearbyHospitalAdmins(bloodGroup, userLat, userLon, effectiveRadius, {
    tier: 'clinical',
    userPhone: normalizePhone(userPhone),
  });

  console.log(`📊 SOS Result: ${alertedCount} of ${donorsWithDistance.length} donors alerted`);

  return {
    sosId: sos._id,
    referenceId: sos.referenceId,
    tier: 'clinical',
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    radiusKm: effectiveRadius,
    widened: effectiveRadius > radiusKm,
    donorsFound: donorsWithDistance.length,
    donorsAlerted: alertedCount,
    nearestHospital,
    message: `Clinical SOS verified. Alerted ${alertedCount} nearby compatible voluntary donor(s).`,
  };
}

// Upgrade a public SOS to a verified clinical broadcast (performed by hospital staff)
async function verifyAndBroadcastSOS(sosId, user) {
  const sos = await SOSRequest.findById(sosId);
  if (!sos) throw new Error('SOS request not found');

  sos.tier = 'clinical';
  sos.hospitalTriageStatus = 'verified_broadcasted';
  sos.doctorName = user.name || 'Verified Hospital Staff';

  const userLat = sos.userLocation?.lat;
  const userLon = sos.userLocation?.lon;
  const radiusKm = sos.radiusKm || 15;
  const compatibleGroups = getCompatibleDonors(sos.bloodGroup);
  const targetGroups = compatibleGroups.length ? compatibleGroups : [sos.bloodGroup];

  const donors = await Donor.find({
    isVerified: { $ne: false },
    $or: [
      { bloodGroupVerified: { $in: targetGroups }, bloodGroupVerificationStatus: 'verified' },
      { bloodGroup: { $in: targetGroups }, bloodGroupVerificationStatus: 'verified' },
    ],
    eligibilityStatus: 'eligible',
    sosOptIn: true,
  });

  const withDistance = donors
    .map(donor => ({
      ...donor.toObject(),
      distance: userLat != null && userLon != null
        ? haversineDistance(userLat, userLon, donor.location.coordinates[1], donor.location.coordinates[0])
        : 0,
    }))
    .sort((a, b) => a.distance - b.distance);

  const tiers = Array.from(new Set([radiusKm, 50, 150].filter((r) => r >= radiusKm))).sort((a, b) => a - b);
  let effectiveRadius = radiusKm;
  let donorsWithDistance = [];
  for (const r of tiers) {
    effectiveRadius = r;
    donorsWithDistance = withDistance.filter((d) => d.distance <= r);
    if (donorsWithDistance.length > 0) break;
  }

  let alertedCount = 0;
  for (const donor of donorsWithDistance) {
    const donorPhone = normalizePhone(donor.phone);
    try {
      const body = `🚨 *URGENT CLINICAL SOS - BLOOD DONATION NEEDED* 🚨\n\nA verified patient near you urgently needs *${sos.bloodGroup}* blood — your *${donor.bloodGroup}* is a match.\n\n📍 Distance: ${donor.distance.toFixed(1)}km from you\n\nIf you are available to donate, please reply with *YES* or *NO*.\n\nThank you for potentially saving a life! 🙏`;
      const dispatchResult = await dispatchWhatsAppMessage(donorPhone, body);
      if (dispatchResult.sent) {
        sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'alerted' });
        alertedCount++;
      } else {
        sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'failed' });
      }
      await Donor.updateOne({ _id: donor._id }, { $inc: { sosAlertCount: 1 }, $set: { lastSosAlert: new Date() } });
    } catch (err) {
      sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'failed' });
    }
  }

  sos.radiusKm = effectiveRadius;
  await sos.save();

  return {
    sosId: sos._id,
    tier: 'clinical',
    donorsFound: donorsWithDistance.length,
    donorsAlerted: alertedCount,
  };
}

async function processDonorResponse(donorPhone, response) {
  const cleanPhone = normalizePhone(donorPhone);
  const formatted = formatNigerianPhone(donorPhone);
  const digitsOnly = donorPhone ? donorPhone.toString().replace(/\D/g, '') : '';
  const local10 = digitsOnly.length >= 10 ? `0${digitsOnly.slice(-10)}` : null;

  const phoneQuery = [
    { phone: cleanPhone },
    ...(formatted ? [{ phone: formatted }] : []),
    ...(digitsOnly ? [{ phone: digitsOnly }] : []),
    ...(local10 ? [{ phone: local10 }] : [])
  ];

  const donor = await Donor.findOne({ $or: phoneQuery });
  if (!donor) return { success: false, message: 'Donor not found' };

  const lowerResponse = response.toLowerCase().trim();
  let responseValue = null;
  if (lowerResponse === 'yes' || lowerResponse === 'y') responseValue = 'yes';
  else if (lowerResponse === 'no' || lowerResponse === 'n') responseValue = 'no';
  else return { success: false, message: 'Please reply with YES or NO.' };

  // Attach the response to the donor's most recent still-pending SOS.
  const sos = await SOSRequest.findOne({
    status: 'pending',
    'donorsAlerted.donorId': donor._id,
  }).sort({ createdAt: -1 });

  if (sos) {
    sos.donorsResponded.push({ donorId: donor._id, response: responseValue, timestamp: new Date() });
    const entry = sos.donorsAlerted.find(
      (a) => a.donorId && a.donorId.toString() === donor._id.toString()
    );
    if (entry) entry.status = responseValue === 'yes' ? 'accepted' : 'declined';
    await sos.save();

    // Close the loop: when a donor accepts, notify the person who raised the
    // SOS with the donor's contact so they can coordinate immediately.
    if (responseValue === 'yes' && sos.userPhone) {
      await dispatchWhatsAppMessage(
        sos.userPhone,
        `🎉 *A donor is available!*\n\n*${donor.name}* (${donor.bloodGroup}) has agreed to donate for your *${sos.bloodGroup}* request.\n\n📞 Contact them: ${donor.phone}\n\nPlease coordinate the donation at your nearest hospital.`
      ).catch((err) => console.error('Failed to notify SOS requester:', err.message));
      console.log(`📣 Notified SOS requester ${sos.userPhone} of donor ${donor.name}`);
    }
  }

  if (responseValue === 'yes') {
    console.log(`✅ Donor ${donor.name} (${donor.phone}) is available`);
    return {
      success: true,
      message: `Thank you, ${donor.name}! A hospital representative will contact you shortly.`,
    };
  }

  console.log(`❌ Donor ${donor.name} declined`);
  return { success: true, message: `Thank you for your honesty, ${donor.name}.` };
}

module.exports = { triggerSOS, verifyAndBroadcastSOS, processDonorResponse };
