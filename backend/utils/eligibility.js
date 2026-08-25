// Donor eligibility rules, shared by registration and the refresh job.

const MIN_AGE = 18;
const MAX_AGE = 65;
const MIN_WEIGHT_KG = 50;
const DONATION_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

// Accurate age in whole years (accounts for month/day, not just the year).
function calculateAge(dateOfBirth, now = new Date()) {
  const dob = new Date(dateOfBirth);
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Evaluate a donor against the eligibility rules.
 * @returns {{ status: 'eligible'|'deferred', reason: string|null }}
 */
function evaluateDonorEligibility({ dateOfBirth, weight, lastDonationDate }, now = new Date()) {
  const reasons = [];

  if (dateOfBirth) {
    const age = calculateAge(dateOfBirth, now);
    if (age < MIN_AGE || age > MAX_AGE) {
      reasons.push(`Age must be between ${MIN_AGE} and ${MAX_AGE} years`);
    }
  }

  if (weight != null && weight < MIN_WEIGHT_KG) {
    reasons.push(`Weight must be at least ${MIN_WEIGHT_KG}kg`);
  }

  if (lastDonationDate) {
    const daysSince = (now.getTime() - new Date(lastDonationDate).getTime()) / DAY_MS;
    if (daysSince < DONATION_INTERVAL_DAYS) {
      reasons.push(`Must wait ${DONATION_INTERVAL_DAYS} days between donations`);
    }
  }

  return reasons.length
    ? { status: 'deferred', reason: reasons.join(', ') }
    : { status: 'eligible', reason: null };
}

module.exports = {
  MIN_AGE,
  MAX_AGE,
  MIN_WEIGHT_KG,
  DONATION_INTERVAL_DAYS,
  calculateAge,
  evaluateDonorEligibility,
};
