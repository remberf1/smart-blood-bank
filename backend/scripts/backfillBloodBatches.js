/**
 * Backfill BloodBatch records for pre-existing Inventory blood rows.
 *
 * WHY: blood is now tracked as dated batches, and Inventory.units is a cache
 * recomputed from available, non-expired batches. Inventory rows created before
 * this change have no backing batches, so the first expiry sweep would drop
 * their cached units to 0. This script creates one manual batch per blood row
 * to cover the gap, preserving the displayed counts.
 *
 * SAFE TO RE-RUN: it only creates the *deficit* (row.units minus the units
 * already backed by available non-expired batches), so a second run is a no-op.
 *
 * Usage (from backend/):
 *   # preview only, no writes:
 *   DRY_RUN=true node scripts/backfillBloodBatches.js
 *   # apply:
 *   node scripts/backfillBloodBatches.js
 *   # optional: assumed shelf life for migrated stock (default 42):
 *   BACKFILL_EXPIRY_DAYS=42 node scripts/backfillBloodBatches.js
 *
 * NOTE: real expiry dates of pre-existing stock are unknown; migrated batches
 * are dated collection=now, expiry=now+BACKFILL_EXPIRY_DAYS. Adjust if you know
 * the stock is older.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const BloodBatch = require('../models/BloodBatch');
const { refreshBloodInventory, SHELF_LIFE_DAYS } = require('../services/inventoryService');

// Note: npm swallows `--dry-run`, so `--preview` is the npm-safe flag.
const DRY_RUN =
  process.env.DRY_RUN === 'true' ||
  process.argv.includes('--dry-run') ||
  process.argv.includes('--preview');
const EXPIRY_DAYS = Number(process.env.BACKFILL_EXPIRY_DAYS) || SHELF_LIFE_DAYS;
const DAY_MS = 24 * 60 * 60 * 1000;

async function availableBatchUnits(hospitalId, bloodGroup) {
  const now = new Date();
  const agg = await BloodBatch.aggregate([
    {
      $match: {
        hospitalId: new mongoose.Types.ObjectId(hospitalId),
        bloodGroup,
        status: 'available',
        expiryDate: { $gt: now },
      },
    },
    { $group: { _id: null, units: { $sum: '$units' } } },
  ]);
  return agg[0]?.units || 0;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}; assumed shelf life: ${EXPIRY_DAYS} days`);

  // Guard: duplicate (hospitalId, bloodGroup) blood rows break the one-cache-
  // row-per-group model and would produce inconsistent results here.
  const dupes = await Inventory.aggregate([
    { $match: { resourceType: 'blood' } },
    { $group: { _id: { hospitalId: '$hospitalId', bloodGroup: '$bloodGroup' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  if (dupes.length > 0) {
    console.error(
      `\nFound ${dupes.length} duplicated blood group(s). Run \`npm run dedupe:inventory\` first, then re-run this.`
    );
    await mongoose.disconnect();
    process.exit(1);
  }

  const rows = await Inventory.find({ resourceType: 'blood', units: { $gt: 0 } });
  console.log(`Found ${rows.length} blood inventory row(s) with units > 0.`);

  let created = 0;
  let unitsCreated = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = await availableBatchUnits(row.hospitalId, row.bloodGroup);
    const deficit = row.units - existing;

    if (deficit <= 0) {
      skipped++;
      console.log(`  skip  ${row.hospitalId} ${row.bloodGroup}: units=${row.units}, already backed=${existing}`);
      continue;
    }

    console.log(`  batch ${row.hospitalId} ${row.bloodGroup}: +${deficit} unit(s) (units=${row.units}, backed=${existing})`);

    if (!DRY_RUN) {
      const now = new Date();
      await BloodBatch.create({
        hospitalId: row.hospitalId,
        bloodGroup: row.bloodGroup,
        donorId: null,
        source: 'manual',
        units: deficit,
        collectionDate: now,
        expiryDate: new Date(now.getTime() + EXPIRY_DAYS * DAY_MS),
        status: 'available',
      });
      await refreshBloodInventory(row.hospitalId, row.bloodGroup);
    }
    created++;
    unitsCreated += deficit;
  }

  console.log(
    `\nDone. rows=${rows.length}, batches ${DRY_RUN ? 'to create' : 'created'}=${created} (${unitsCreated} units), skipped=${skipped}.`
  );
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
