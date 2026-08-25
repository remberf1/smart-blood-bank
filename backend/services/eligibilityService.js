const Donor = require('../models/Donor');
const { evaluateDonorEligibility } = require('../utils/eligibility');
const { notifyDonorEligible } = require('./notificationService');

// Matches the deferral reasons that the system sets automatically for the
// post-donation waiting period (from registration or recording a donation).
const DONATION_WAIT_REASON = /90 days|waiting period after donation/i;

/**
 * Restore donors whose only reason for being deferred was the post-donation
 * waiting period, once that period has passed and they still meet the other
 * rules. Deliberately leaves donors deferred for age/weight/medical/manual
 * reasons untouched (their reason string won't match DONATION_WAIT_REASON, or
 * re-evaluation still returns deferred).
 *
 * @returns {Promise<number>} number of donors restored to eligible
 */
async function refreshDonorEligibility() {
  const now = new Date();
  const deferred = await Donor.find({
    eligibilityStatus: 'deferred',
    lastDonationDate: { $ne: null },
  });

  let restored = 0;
  for (const donor of deferred) {
    if (!DONATION_WAIT_REASON.test(donor.deferralReason || '')) continue;

    const { status } = evaluateDonorEligibility(donor, now);
    if (status === 'eligible') {
      donor.eligibilityStatus = 'eligible';
      donor.deferralReason = null;
      await donor.save();
      restored++;
      // Best-effort: tell the donor they can donate again.
      notifyDonorEligible(donor).catch(() => {});
    }
  }
  return restored;
}

module.exports = { refreshDonorEligibility };
