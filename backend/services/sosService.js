require('dotenv').config();
const twilio = require('twilio');
const Donor = require('../models/Donor');
const SOSRequest = require('../models/SOSRequest');
const Hospital = require('../models/Hospital');
const User = require('../models/User');
const { normalizePhone, formatNigerianPhone } = require('../utils/phone');
const { getCompatibleDonors } = require('../utils/bloodCompatibility');
const { sendEmail, buildSosAlertEmail } = require('./notificationService');

// Email the admins of hospitals near an SOS so they can mobilise stock. Best-
// effort and never throws — admin alerting must not break the SOS itself.
async function alertNearbyHospitalAdmins(bloodGroup, lat, lon, radiusKm) {
  try {
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
    // If no hospital is within radiusKm, fallback to alerting all active admins/superadmins.
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
        if (a.email) sendEmail(a.email, e.subject, e.text, e.html).catch(() => {});
      }
      console.log(`📧 SOS: alerted ${admins.length} hospital admin/superadmin(s) near the request`);
    }

    // If an admin WhatsApp phone is configured in .env, send a direct WhatsApp alert too
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
    if (adminPhone && client) {
      const cleanPhone = normalizePhone(adminPhone);
      if (cleanPhone) {
        const mapUrl = lat != null && lon != null ? `https://www.google.com/maps?q=${lat},${lon}` : null;
        await client.messages.create({
          body: `🚨 *ADMIN ALERT — EMERGENCY SOS* 🚨\n\nAn emergency SOS for *${bloodGroup}* blood was triggered near coordinates (${lat ?? 'N/A'}, ${lon ?? 'N/A'}).\n\n${mapUrl ? `📍 Location: ${mapUrl}\n` : ''}Eligible donors are being alerted. Please monitor on your dashboard: /dashboard/sos`,
          from: process.env.TWILIO_WHATSAPP_NUMBER,
          to: `whatsapp:${cleanPhone}`,
        }).catch((err) => console.warn('Admin WhatsApp SOS dispatch warning:', err.message));
      }
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

async function triggerSOS(bloodGroup, userLat, userLon, userPhone, radiusKm = 15) {
  console.log(`🚨 SOS TRIGGERED: ${bloodGroup} needed at (${userLat}, ${userLon})`);
  console.log('Using Twilio from number:', process.env.TWILIO_WHATSAPP_NUMBER);

  // Alert every donor whose blood is COMPATIBLE with the patient's need
  // (e.g. an A+ patient can receive from A+, A-, O+, O-), not just exact match.
  const compatibleGroups = getCompatibleDonors(bloodGroup);
  const donors = await Donor.find({
    bloodGroup: { $in: compatibleGroups.length ? compatibleGroups : [bloodGroup] },
    eligibilityStatus: 'eligible',
    sosOptIn: true, // respect donors who opted out of SOS alerts
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

  // Auto-widen the search radius until donors are found (emergency), up to a cap.
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

  // Persist the SOS event up front so alert outcomes can be recorded.
  const sos = new SOSRequest({
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    userPhone: normalizePhone(userPhone),
    radiusKm: effectiveRadius,
    status: 'pending',
  });

  let alertedCount = 0;
  for (const donor of donorsWithDistance) {
    const donorPhone = normalizePhone(donor.phone);
    try {
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      const toNumber = `whatsapp:${donorPhone}`;

      console.log(`📨 Sending SOS to: ${toNumber} from: ${fromNumber}`);

      let messageSid = 'disabled';
      if (client) {
        const message = await client.messages.create({
          body: `🚨 *URGENT SOS - BLOOD DONATION NEEDED* 🚨\n\nA patient near you urgently needs *${bloodGroup}* blood — your *${donor.bloodGroup}* is a match.\n\n📍 Distance: ${donor.distance.toFixed(1)}km from you\n\nIf you are available to donate, please reply with *YES* or *NO*.\n\nThank you for potentially saving a life! 🙏`,
          from: fromNumber,
          to: toNumber
        });
        messageSid = message.sid;
      } else {
        console.log(`ℹ️ Twilio disabled or unconfigured; simulated SOS dispatch to ${donorPhone}`);
      }

      sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'alerted' });
      alertedCount++;
      console.log(`✅ SOS sent to: ${donorPhone}, SID: ${messageSid}`);

      // Track alert stats on the donor record.
      await Donor.updateOne(
        { _id: donor._id },
        { $inc: { sosAlertCount: 1 }, $set: { lastSosAlert: new Date() } }
      );
    } catch (err) {
      sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'failed' });
      console.error(`❌ Failed to send SOS to ${donorPhone}:`, err.message);
    }
  }

  await sos.save();

  // Also alert the admins of nearby hospitals (best-effort, fire-and-forget).
  alertNearbyHospitalAdmins(bloodGroup, userLat, userLon, effectiveRadius);

  console.log(`📊 SOS Result: ${alertedCount} of ${donorsWithDistance.length} donors alerted`);

  return {
    sosId: sos._id,
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    radiusKm: effectiveRadius,
    widened: effectiveRadius > radiusKm,
    donorsFound: donorsWithDistance.length,
    donorsAlerted: alertedCount
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
      if (client) {
        try {
          await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_NUMBER,
            to: `whatsapp:${sos.userPhone}`,
            body: `🎉 *A donor is available!*\n\n*${donor.name}* (${donor.bloodGroup}) has agreed to donate for your *${sos.bloodGroup}* request.\n\n📞 Contact them: ${donor.phone}\n\nPlease coordinate the donation at your nearest hospital.`,
          });
          console.log(`📣 Notified SOS requester ${sos.userPhone} of donor ${donor.name}`);
        } catch (err) {
          console.error('Failed to notify SOS requester:', err.message);
        }
      } else {
        console.log(`ℹ️ Twilio disabled or unconfigured; simulated notification to SOS requester ${sos.userPhone}`);
      }
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

module.exports = { triggerSOS, processDonorResponse };
