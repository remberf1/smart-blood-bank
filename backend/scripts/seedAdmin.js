/**
 * One-time super-admin seed script.
 *
 * Usage (from backend/):
 *   SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=change-me SEED_ADMIN_NAME="Super Admin" node scripts/seedAdmin.js
 *
 * Reads MONGODB_URI from .env. Creates a superadmin only if one does not
 * already exist with the given email. This replaces the old public
 * GET /api/setup/create-admin endpoint, which let anyone create an admin.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('Missing SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD environment variables.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('SEED_ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`User already exists: ${existing.email} (role: ${existing.role})`);
    await mongoose.disconnect();
    process.exit(0);
  }

  // password is hashed by the User pre-save hook
  const admin = new User({ name, email, password, role: 'superadmin', isActive: true });
  await admin.save();

  console.log(`Super admin created: ${email}`);
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
