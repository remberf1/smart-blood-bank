// Canonicalize a Nigerian phone number to E.164 (+234XXXXXXXXXX).
// Accepts local (0803...), country-code (234803...), or +234 forms.
// Returns null when it isn't a valid 10-digit Nigerian number.
function formatNigerianPhone(phone) {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/\D/g, '');

  // Drop a single leading zero from the local format.
  if (cleaned.startsWith('0')) cleaned = cleaned.substring(1);

  if (cleaned.startsWith('234')) {
    // 234 + 10 digits
    if (cleaned.length !== 13) return null;
    return '+' + cleaned;
  }

  if (cleaned.length !== 10) return null;
  return '+234' + cleaned;
}

// Loosely normalize any phone to a leading-'+' form, for storage/matching.
// Unlike formatNigerianPhone this does not validate length or country.
function normalizePhone(phone) {
  if (!phone) return '';
  let cleaned = phone.toString().replace(/[^0-9+]/g, '');
  if (!cleaned.startsWith('+')) cleaned = '+' + cleaned;
  return cleaned;
}

module.exports = { formatNigerianPhone, normalizePhone };
