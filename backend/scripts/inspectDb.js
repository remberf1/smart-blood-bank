const mongoose = require('mongoose');
require('dotenv').config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const Hospital = mongoose.model('Hospital', new mongoose.Schema({}, { strict: false }));
  const Inventory = mongoose.model('Inventory', new mongoose.Schema({ hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' } }, { strict: false }));
  const Donor = mongoose.model('Donor', new mongoose.Schema({}, { strict: false }));

  console.log('--- HOSPITALS ---');
  const hospitals = await Hospital.find({});
  console.log(JSON.stringify(hospitals.map(h => ({ id: h._id.toString(), name: h.name })), null, 2));

  console.log('--- RAW INVENTORIES ---');
  const rawInv = await mongoose.connection.collection('inventories').find({}).toArray();
  console.log(JSON.stringify(rawInv.filter(i => !i.hospitalId || ['6aa86f53fdb2fe49fe11808e', '6aa86f9afdb2fe49fe118091', '6aa87145fdb2fe49fe118094', '6aa876aa3c9f572d228b859b'].includes(i._id.toString())), null, 2));

  console.log('--- BLOOD BATCHES FOR THOSE ---');
  const batches = await mongoose.connection.collection('bloodbatches').find({}).toArray();
  console.log(JSON.stringify(batches.map(b => ({ id: b._id, hospitalId: b.hospitalId, bloodGroup: b.bloodGroup, units: b.units, donorId: b.donorId, source: b.source, createdAt: b.createdAt })), null, 2));

  console.log('--- BABCOCK DONORS ---');
  const donors = await Donor.find({ name: { $in: ['Test Donor 6', 'John Doe'] } });
  console.log(JSON.stringify(donors.map(d => ({ name: d.name, homeHospitalId: d.homeHospitalId, lastDonationDate: d.lastDonationDate })), null, 2));

  await mongoose.disconnect();
}
check().catch(console.error);
