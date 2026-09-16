const mongoose = require('mongoose');
require('dotenv').config();

async function clean() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const DELETED_HOSPITAL_ID = '69fcf05453cad5bc8da03662';

  // 1. Delete orphaned inventory records referencing deleted hospital
  const invResult = await mongoose.connection.collection('inventories').deleteMany({
    hospitalId: new mongoose.Types.ObjectId(DELETED_HOSPITAL_ID)
  });
  console.log(`Deleted ${invResult.deletedCount} orphaned inventory records`);

  // 2. Delete orphaned blood batches referencing deleted hospital
  const batchResult = await mongoose.connection.collection('bloodbatches').deleteMany({
    hospitalId: new mongoose.Types.ObjectId(DELETED_HOSPITAL_ID)
  });
  console.log(`Deleted ${batchResult.deletedCount} orphaned blood batches`);

  // 3. Trim trailing spaces on Babcock hospital name
  const updateHosp = await mongoose.connection.collection('hospitals').updateMany(
    { name: /Babcock/i },
    [{ $set: { name: { $trim: { input: '$name' } } } }]
  );
  console.log(`Trimmed hospital name(s): ${updateHosp.modifiedCount}`);

  // Print all current hospitals
  const hospitals = await mongoose.connection.collection('hospitals').find({}).toArray();
  console.log('Current hospitals:', hospitals.map(h => ({ id: h._id.toString(), name: `"${h.name}"` })));

  // Print blood inventory counts
  const inventory = await mongoose.connection.collection('inventories').find({}).toArray();
  console.log(`Total inventory records remaining: ${inventory.length}`);

  await mongoose.disconnect();
  console.log('Done.');
}

clean().catch(console.error);
