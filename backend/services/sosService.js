require('dotenv').config();
const twilio = require('twilio');
const Donor = require('../models/Donor');
const SOSRequest = require('../models/SOSRequest');

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

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

// Normalize a phone number to a leading-'+' E.164-ish form for matching.
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.replace(/[^0-9+]/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

async function triggerSOS(bloodGroup, userLat, userLon, userPhone, radiusKm = 15) {
  console.log(`🚨 SOS TRIGGERED: ${bloodGroup} needed at (${userLat}, ${userLon})`);
  console.log('Using Twilio from number:', process.env.TWILIO_WHATSAPP_NUMBER);

  const donors = await Donor.find({
    bloodGroup: bloodGroup,
    eligibilityStatus: 'eligible',
    sosOptIn: true, // respect donors who opted out of SOS alerts
  });

  const donorsWithDistance = donors.map(donor => {
    const distance = haversineDistance(
      userLat, userLon,
      donor.location.coordinates[1],
      donor.location.coordinates[0]
    );
    return { ...donor.toObject(), distance };
  }).filter(d => d.distance <= radiusKm);

  console.log(`📍 Found ${donorsWithDistance.length} eligible donors within ${radiusKm}km`);

  // Persist the SOS event up front so alert outcomes can be recorded.
  const sos = new SOSRequest({
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    userPhone: normalizePhone(userPhone),
    radiusKm,
    status: 'pending',
  });

  let alertedCount = 0;
  for (const donor of donorsWithDistance) {
    const donorPhone = normalizePhone(donor.phone);
    try {
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      const toNumber = `whatsapp:${donorPhone}`;

      console.log(`📨 Sending SOS to: ${toNumber} from: ${fromNumber}`);

      const message = await client.messages.create({
        body: `🚨 *URGENT SOS - BLOOD DONATION NEEDED* 🚨\n\nA patient near you urgently needs *${bloodGroup}* blood.\n\n📍 Distance: ${donor.distance.toFixed(1)}km from you\n\nIf you are available to donate, please reply with *YES* or *NO*.\n\nThank you for potentially saving a life! 🙏`,
        from: fromNumber,
        to: toNumber
      });

      sos.donorsAlerted.push({ donorId: donor._id, phone: donorPhone, status: 'alerted' });
      alertedCount++;
      console.log(`✅ SOS sent to: ${donorPhone}, SID: ${message.sid}`);

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

  console.log(`📊 SOS Result: ${alertedCount} of ${donorsWithDistance.length} donors alerted`);

  return {
    sosId: sos._id,
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    radiusKm,
    donorsFound: donorsWithDistance.length,
    donorsAlerted: alertedCount
  };
}

async function processDonorResponse(donorPhone, response) {
  const cleanPhone = normalizePhone(donorPhone);

  const donor = await Donor.findOne({ phone: cleanPhone });
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
    // TODO: on 'yes', notify the requesting hospital (hospitalNotified) once
    // hospital selection for an SOS is wired in.
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
