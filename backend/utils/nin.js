const crypto = require('crypto');

/**
 * Deterministic cryptographic hash of a Nigerian National Identity Number (NIN).
 * Used for exact-match deduplication and fraud prevention without storing plaintext NIN.
 * Irreversible (one-way SHA-256 with pepper).
 */
function hashNin(nin) {
  if (!nin) return null;
  const clean = nin.toString().replace(/\D/g, '');
  if (!clean) return null;
  const pepper = process.env.NIN_PEPPER || process.env.JWT_SECRET || 'sbb-nin-protection-pepper-2026';
  return crypto.createHmac('sha256', pepper).update(clean).digest('hex');
}

/**
 * Masks a NIN for safe UI/API display, preserving only the last 4 digits.
 * e.g., '21475086321' -> '*******6321'
 */
function maskNin(nin) {
  if (!nin) return null;
  const clean = nin.toString().replace(/\D/g, '');
  if (!clean) return null;
  if (clean.length < 4) return clean;
  return '*******' + clean.slice(-4);
}

module.exports = { hashNin, maskNin };
