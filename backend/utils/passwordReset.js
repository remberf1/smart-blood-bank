const crypto = require('crypto');

// Password-reset tokens: we email the RAW token to the user but only ever store
// its SHA-256 hash, so a leaked database can't be used to reset accounts.
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Returns { raw, hash, expiry }. Email `raw`; persist `hash` + `expiry`.
function generateResetToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  return {
    raw,
    hash: hashToken(raw),
    expiry: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  };
}

module.exports = { hashToken, generateResetToken, RESET_TOKEN_TTL_MS };
