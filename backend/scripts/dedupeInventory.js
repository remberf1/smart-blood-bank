/**
 * Merge duplicate blood Inventory rows.
 *
 * Older data can contain more than one Inventory row for the same
 * (hospitalId, bloodGroup) because the uniqueness index couldn't build while
 * duplicates existed. Duplicates cause double-counting in search/WPS and break
 * the "one cache row per group" assumption of the batch model.
 *
 * This keeps ONE row per (hospitalId, bloodGroup), sets its units to the SUM of
 * the duplicates, deletes the rest, then builds the unique index.
 *
 * IMPORTANT: the summed units assume the duplicates were separate real stock.
 * If they were accidental double-entries, verify against physical stock after.
 *
 * Usage (from backend/):
 *   DRY_RUN=true node scripts/dedupeInventory.js   # preview
 *   node scripts/dedupeInventory.js                # apply
 *
 * Run this BEFORE scripts/backfillBloodBatches.js.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');

// Note: npm swallows `--dry-run`, so `--preview` is the npm-safe flag.
const DRY_RUN =
  process.env.DRY_RUN === 'true' ||
  process.argv.includes('--dry-run') ||
  process.argv.includes('--preview');

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
  console.log(`Connected. Mode: ${DRY_RUN ? 'DRY RUN (no writes)' : 'APPLY'}`);

  const groups = await Inventory.aggregate([
    { $match: { resourceType: 'blood' } },
    {
      $group: {
        _id: { hospitalId: '$hospitalId', bloodGroup: '$bloodGroup' },
        ids: { $push: '$_id' },
        unitsSum: { $sum: '$units' },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Found ${groups.length} duplicated blood group(s).`);

  let merged = 0;
  let removed = 0;
  for (const g of groups) {
    const [keepId, ...dropIds] = g.ids;
    console.log(
      `  merge ${g._id.hospitalId} ${g._id.bloodGroup}: ${g.count} rows -> units=${g.unitsSum} (keep ${keepId}, drop ${dropIds.length})`
    );
    if (!DRY_RUN) {
      await Inventory.updateOne(
        { _id: keepId },
        { $set: { units: g.unitsSum, lastUpdatedAt: new Date() } }
      );
      await Inventory.deleteMany({ _id: { $in: dropIds } });
    }
    merged++;
    removed += dropIds.length;
  }

  if (!DRY_RUN) {
    // Now that duplicates are gone, the partial unique index can build.
    await Inventory.syncIndexes();
    console.log('Indexes synced (unique blood index now enforced).');
  }

  console.log(`\nDone. groups merged=${merged}, rows removed=${removed}.`);
  console.log(DRY_RUN ? 'Dry run only — no changes written.' : 'Next: run `npm run backfill:batches`.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Dedupe failed:', err);
  process.exit(1);
});
