// Red-cell (RBC) transfusion compatibility.
//
// Each recipient maps to the donor groups they can safely receive, ORDERED by
// preference: exact/same-ABO first, universal (O-) last. Consuming in this
// order conserves scarce universal stock for the patients who truly need it.

const COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'A+', 'B+', 'AB-', 'A-', 'B-', 'O+', 'O-'],
};

// Preference-ordered list of donor groups a recipient can receive.
function getCompatibleDonors(recipientGroup) {
  return COMPATIBILITY[recipientGroup] || [];
}

// Can `recipientGroup` receive red cells from `donorGroup`?
function isCompatible(recipientGroup, donorGroup) {
  return getCompatibleDonors(recipientGroup).includes(donorGroup);
}

// Preference rank of a donor group for a recipient: 0 = most preferred
// (exact/same-ABO first, universal O- last), matching the COMPATIBILITY order.
// Returns -1 when the group is not compatible at all.
function compatibilityIndex(recipientGroup, donorGroup) {
  return getCompatibleDonors(recipientGroup).indexOf(donorGroup);
}

// Normalized preference score in [0,1] for ranking: 1 = exact/most preferred,
// decreasing for less-preferred (but still valid) substitutes; 0 if incompatible.
function compatibilityScore(recipientGroup, donorGroup) {
  const list = getCompatibleDonors(recipientGroup);
  const idx = list.indexOf(donorGroup);
  if (idx === -1) return 0;
  if (list.length === 1) return 1;
  return 1 - idx / (list.length - 1);
}

module.exports = {
  COMPATIBILITY,
  getCompatibleDonors,
  isCompatible,
  compatibilityIndex,
  compatibilityScore,
};
