const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCompatibleDonors,
  isCompatible,
  COMPONENT_RULES,
  RED_CELL_COMPATIBILITY,
  PLASMA_COMPATIBILITY,
} = require('../utils/bloodCompatibility');
const { patientRequestSchema, donorRegisterSchema } = require('../validators/schemas');

test('Blood Compatibility: Red cell rules treat O- as universal donor', () => {
  // A+ recipient can receive A+, A-, O+, O- red cells
  const aPlusRbc = getCompatibleDonors('A+', 'PACKED_RED_CELLS');
  assert.deepEqual(aPlusRbc, ['A+', 'A-', 'O+', 'O-']);
  assert.equal(isCompatible('A+', 'O-', 'PACKED_RED_CELLS'), true);
  assert.equal(isCompatible('A+', 'B+', 'PACKED_RED_CELLS'), false);

  // O- recipient can ONLY receive O- red cells
  const oNegRbc = getCompatibleDonors('O-', 'WHOLE_BLOOD');
  assert.deepEqual(oNegRbc, ['O-']);
  assert.equal(isCompatible('O-', 'O+', 'WHOLE_BLOOD'), false);
});

test('Blood Compatibility: Plasma rules treat AB as universal plasma donor (reverse ABO rules)', () => {
  // AB plasma contains NO anti-A or anti-B antibodies -> can be given to all ABO types
  // O+ patient has A and B antibodies in their plasma, but NO A/B antigens on their red cells.
  // Therefore, O+ patients can receive plasma from O, A, B, or AB donors!
  const oPlusPlasma = getCompatibleDonors('O+', 'FRESH_FROZEN_PLASMA');
  assert.equal(oPlusPlasma.includes('AB+'), true);
  assert.equal(oPlusPlasma.includes('O+'), true);
  assert.equal(oPlusPlasma.includes('A+'), true);

  // AB+ recipient can receive plasma ONLY from AB donors (AB+, AB-)
  const abPlusPlasma = getCompatibleDonors('AB+', 'FRESH_FROZEN_PLASMA');
  assert.deepEqual(abPlusPlasma, ['AB+', 'AB-']);
  assert.equal(isCompatible('AB+', 'AB+', 'FRESH_FROZEN_PLASMA'), true);
  assert.equal(isCompatible('AB+', 'O+', 'FRESH_FROZEN_PLASMA'), false); // O plasma contains anti-A and anti-B!

  // Cryoprecipitate follows same reverse plasma compatibility
  const cryoCompat = getCompatibleDonors('AB+', 'CRYOPRECIPITATE');
  assert.deepEqual(cryoCompat, ['AB+', 'AB-']);
});

test('Component Rules: Shelf life, storage temps, and alert thresholds', () => {
  // Platelets: strict 5-day shelf life with 1-day critical alert
  assert.equal(COMPONENT_RULES.PLATELET_CONCENTRATE.shelfLifeDays, 5);
  assert.equal(COMPONENT_RULES.PLATELET_CONCENTRATE.nearExpiryDays, 1);
  assert.match(COMPONENT_RULES.PLATELET_CONCENTRATE.storageTemp, /20-24C/);

  // Packed Red Cells: 42 days, 2-6°C, 7-day alert
  assert.equal(COMPONENT_RULES.PACKED_RED_CELLS.shelfLifeDays, 42);
  assert.equal(COMPONENT_RULES.PACKED_RED_CELLS.nearExpiryDays, 7);
  assert.equal(COMPONENT_RULES.PACKED_RED_CELLS.storageTemp, '2-6C');

  // Fresh Frozen Plasma: 365 days (1 yr), -18°C or colder, requires thawing
  assert.equal(COMPONENT_RULES.FRESH_FROZEN_PLASMA.shelfLifeDays, 365);
  assert.equal(COMPONENT_RULES.FRESH_FROZEN_PLASMA.storageTemp, '-18C or colder');
  assert.equal(COMPONENT_RULES.FRESH_FROZEN_PLASMA.requiresThawing, true);
});

test('Patient Request Schema: Validates Nigerian phone numbers and rejects arbitrary letters', () => {
  const validPayload = {
    contactPhone: '08012345678',
    resourceType: 'blood',
    bloodGroup: 'A+',
    componentType: 'PACKED_RED_CELLS',
    units: 2,
    doctorName: 'Dr. Adeleke',
  };

  const parsedValid = patientRequestSchema.safeParse(validPayload);
  assert.equal(parsedValid.success, true);

  // Rejects invalid phone numbers like 'hh' or random letters
  const invalidPhonePayload = {
    ...validPayload,
    contactPhone: 'hh',
  };
  const parsedInvalid = patientRequestSchema.safeParse(invalidPhonePayload);
  assert.equal(parsedInvalid.success, false);

  // Rejects non-phone symbols
  const invalidSymbols = {
    ...validPayload,
    contactPhone: 'abc-xyz-????',
  };
  assert.equal(patientRequestSchema.safeParse(invalidSymbols).success, false);
});

test('Donor Register Schema: Validates non-remuneration and donationTypePreference', () => {
  const validDonor = {
    name: 'Tunde Bakare',
    phone: '08098765432',
    bloodGroup: 'O+',
    dateOfBirth: '1995-05-15',
    location: { type: 'Point', coordinates: [3.3792, 6.5244] },
    donationTypePreference: 'PLATELET_APHERESIS',
    nonRemunerationDeclared: true,
  };

  const parsed = donorRegisterSchema.safeParse(validDonor);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.donationTypePreference, 'PLATELET_APHERESIS');
    assert.equal(parsed.data.nonRemunerationDeclared, true);
  }
});
