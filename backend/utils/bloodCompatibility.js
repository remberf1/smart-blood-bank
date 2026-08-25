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

module.exports = { COMPATIBILITY, getCompatibleDonors, isCompatible };
