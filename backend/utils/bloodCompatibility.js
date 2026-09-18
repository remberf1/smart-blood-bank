// Clinical Transfusion Compatibility & Blood Component Rules
// Compliant with NBSC Operational Guidelines & WHO Blood Transfusion Standards.

// 1. Red-cell (RBC) & Whole Blood transfusion compatibility.
// Recipient maps to acceptable donor groups, ordered by clinical preference:
// same-ABO first, universal (O-) last.
const RED_CELL_COMPATIBILITY = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'A+', 'B+', 'AB-', 'A-', 'B-', 'O+', 'O-'],
};

// 2. Plasma transfusion compatibility (REVERSE of red cells).
// Donor plasma must NOT have antibodies against recipient red cells.
// AB plasma has no anti-A or anti-B antibodies -> AB is the universal plasma donor!
// Group O red cells have no antigens -> Group O patients can receive any plasma!
const PLASMA_COMPATIBILITY = {
  'AB+': ['AB+', 'AB-'],
  'AB-': ['AB-', 'AB+'],
  'A+': ['A+', 'A-', 'AB+', 'AB-'],
  'A-': ['A-', 'AB-', 'A+', 'AB+'],
  'B+': ['B+', 'B-', 'AB+', 'AB-'],
  'B-': ['B-', 'AB-', 'B+', 'AB+'],
  'O+': ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'], // Universal plasma recipient
  'O-': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'],
};

// Component-specific clinical standards (shelf life, temperature, alert window, volume)
const COMPONENT_RULES = {
  WHOLE_BLOOD: {
    key: 'WHOLE_BLOOD',
    label: 'Whole Blood',
    storageTemp: '2-6C',
    shelfLifeDays: 35, // CPDA-1 anticoagulant
    nearExpiryDays: 7,
    volumeMl: 450,
    category: 'red_cell',
    clinicalUse: 'Massive haemorrhage, whole blood exchange transfusion',
    requiresThawing: false,
  },
  PACKED_RED_CELLS: {
    key: 'PACKED_RED_CELLS',
    label: 'Packed Red Blood Cells (PRBC)',
    storageTemp: '2-6C',
    shelfLifeDays: 42, // SAGM additive solution
    nearExpiryDays: 7,
    volumeMl: 250,
    category: 'red_cell',
    clinicalUse: 'Severe anaemia, surgical/traumatic blood loss',
    requiresThawing: false,
  },
  PLATELET_CONCENTRATE: {
    key: 'PLATELET_CONCENTRATE',
    label: 'Platelet Concentrate',
    storageTemp: '20-24C with agitation',
    shelfLifeDays: 5, // Strict 5-day lifespan
    nearExpiryDays: 1, // Critical 24-hour urgency alert
    volumeMl: 50,
    category: 'platelet',
    clinicalUse: 'Thrombocytopenia, active bleeding disorders',
    requiresThawing: false,
  },
  FRESH_FROZEN_PLASMA: {
    key: 'FRESH_FROZEN_PLASMA',
    label: 'Fresh Frozen Plasma (FFP)',
    storageTemp: '-18C or colder',
    shelfLifeDays: 365,
    nearExpiryDays: 30,
    volumeMl: 250,
    category: 'plasma',
    clinicalUse: 'Multiple coagulation factor deficiencies, DIC, warfarin reversal',
    requiresThawing: true,
  },
  CRYOPRECIPITATE: {
    key: 'CRYOPRECIPITATE',
    label: 'Cryoprecipitate',
    storageTemp: '-18C or colder',
    shelfLifeDays: 365,
    nearExpiryDays: 30,
    volumeMl: 20,
    category: 'plasma',
    clinicalUse: 'Hypofibrinogenaemia, von Willebrand disease, Factor XIII deficiency',
    requiresThawing: true,
  },
};

const COMPATIBILITY = RED_CELL_COMPATIBILITY;

// Preference-ordered list of donor groups a recipient can receive based on component type
function getCompatibleDonors(recipientGroup, componentType = 'PACKED_RED_CELLS') {
  if (componentType === 'FRESH_FROZEN_PLASMA' || componentType === 'CRYOPRECIPITATE') {
    return PLASMA_COMPATIBILITY[recipientGroup] || [];
  }
  return RED_CELL_COMPATIBILITY[recipientGroup] || [];
}

// Can `recipientGroup` receive the given component from `donorGroup`?
function isCompatible(recipientGroup, donorGroup, componentType = 'PACKED_RED_CELLS') {
  return getCompatibleDonors(recipientGroup, componentType).includes(donorGroup);
}

// Preference rank of a donor group for a recipient: 0 = most preferred
function compatibilityIndex(recipientGroup, donorGroup, componentType = 'PACKED_RED_CELLS') {
  return getCompatibleDonors(recipientGroup, componentType).indexOf(donorGroup);
}

// Normalized preference score in [0,1] for ranking: 1 = exact/most preferred
function compatibilityScore(recipientGroup, donorGroup, componentType = 'PACKED_RED_CELLS') {
  const list = getCompatibleDonors(recipientGroup, componentType);
  const idx = list.indexOf(donorGroup);
  if (idx === -1) return 0;
  if (list.length === 1) return 1;
  return 1 - idx / (list.length - 1);
}

module.exports = {
  RED_CELL_COMPATIBILITY,
  PLASMA_COMPATIBILITY,
  COMPATIBILITY,
  COMPONENT_RULES,
  getCompatibleDonors,
  isCompatible,
  compatibilityIndex,
  compatibilityScore,
};
