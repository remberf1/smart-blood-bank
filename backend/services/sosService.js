require('dotenv').config();
const twilio = require('twilio');
const Donor = require('../models/Donor');

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

async function triggerSOS(bloodGroup, userLat, userLon, userPhone, radiusKm = 15) {
  console.log(`🚨 SOS TRIGGERED: ${bloodGroup} needed at (${userLat}, ${userLon})`);
  console.log('Using Twilio from number:', process.env.TWILIO_WHATSAPP_NUMBER);
  
  const donors = await Donor.find({
    bloodGroup: bloodGroup,
    eligibilityStatus: 'eligible'
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
  
  let alertedCount = 0;
  for (const donor of donorsWithDistance) {
    try {
      // Format the donor's phone number properly
      let donorPhone = donor.phone;
      // Remove any non-digit characters except +
      donorPhone = donorPhone.replace(/[^0-9+]/g, '');
      // Ensure it starts with +
      if (!donorPhone.startsWith('+')) {
        donorPhone = '+' + donorPhone;
      }
      
      const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
      const toNumber = `whatsapp:${donorPhone}`;
      
      console.log(`📨 Sending SOS to: ${toNumber} from: ${fromNumber}`);
      
      const message = await client.messages.create({
        body: `🚨 *URGENT SOS - BLOOD DONATION NEEDED* 🚨\n\nA patient near you urgently needs *${bloodGroup}* blood.\n\n📍 Distance: ${donor.distance.toFixed(1)}km from you\n\nIf you are available to donate, please reply with *YES* or *NO*.\n\nThank you for potentially saving a life! 🙏`,
        from: fromNumber,
        to: toNumber
      });
      
      alertedCount++;
      console.log(`✅ SOS sent to: ${donorPhone}, SID: ${message.sid}`);
    } catch (err) {
      console.error(`❌ Failed to send SOS to ${donor.phone}:`, err.message);
    }
  }
  
  console.log(`📊 SOS Result: ${alertedCount} of ${donorsWithDistance.length} donors alerted`);
  
  return {
    bloodGroup,
    userLocation: { lat: userLat, lon: userLon },
    radiusKm,
    donorsFound: donorsWithDistance.length,
    donorsAlerted: alertedCount
  };
}

async function processDonorResponse(donorPhone, response) {
  // Clean the phone number for lookup
  let cleanPhone = donorPhone.replace(/[^0-9+]/g, '');
  if (!cleanPhone.startsWith('+')) {
    cleanPhone = '+' + cleanPhone;
  }
  
  const donor = await Donor.findOne({ phone: { $regex: cleanPhone.replace('+', '\\+') } });
  if (!donor) return { success: false, message: 'Donor not found' };
  
  const lowerResponse = response.toLowerCase().trim();
  
  if (lowerResponse === 'yes' || lowerResponse === 'y') {
    console.log(`✅ Donor ${donor.name} (${donor.phone}) is available`);
    return { 
      success: true, 
      message: `Thank you, ${donor.name}! A hospital representative will contact you shortly.`
    };
  }
  
  if (lowerResponse === 'no' || lowerResponse === 'n') {
    console.log(`❌ Donor ${donor.name} declined`);
    return { success: true, message: `Thank you for your honesty, ${donor.name}.` };
  }
  
  return { success: false, message: 'Please reply with YES or NO.' };
}

module.exports = { triggerSOS, processDonorResponse };