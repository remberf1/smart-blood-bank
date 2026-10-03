const { test } = require('node:test');
const assert = require('node:assert');
const ClinicalRequisition = require('../models/ClinicalRequisition');
const PatientRequest = require('../models/PatientRequest');
const {
  clinicalRequisitionSchema,
  patientRequestSchema,
  cancellationSchema,
  cancellationReasonEnum,
} = require('../validators/schemas');

test('Model Alias: ClinicalRequisition and PatientRequest share the exact same underlying model', () => {
  assert.strictEqual(ClinicalRequisition, PatientRequest);
  assert.strictEqual(ClinicalRequisition.modelName, 'ClinicalRequisition');
  assert.strictEqual(ClinicalRequisition.collection.name, 'patientrequests');
});

test('Schema: ClinicalRequisition defines doctorRef, source, cancellation and consequences subdocuments', () => {
  const paths = ClinicalRequisition.schema.paths;
  assert.ok(paths['doctorRef.name']);
  assert.ok(paths['doctorRef.phone']);
  assert.ok(paths['doctorRef.verificationStatus']);
  assert.ok(paths['source']);
  assert.ok(paths['cancellation.reason']);
  assert.ok(paths['cancellation.notes']);
  assert.ok(paths['cancellation.cancelledAt']);
  assert.ok(paths['cancellation.cancelledByRole']);
  assert.ok(paths['consequences.allocatedUnitsReleased']);
  assert.ok(paths['consequences.sosBroadcastStopped']);
  assert.ok(paths['consequences.familyNotified']);
});

test('Schema: doctorRef.verificationStatus defaults to unverified', () => {
  const doc = new ClinicalRequisition({
    resourceType: 'blood',
    bloodGroup: 'O+',
    units: 2,
    contactPhone: '08012345678',
  });
  assert.strictEqual(doc.doctorRef.verificationStatus, 'unverified');
  assert.strictEqual(doc.source, 'web_form');
  assert.strictEqual(doc.deliveryStatus, 'pending');
});

test('Validation: cancellationReasonEnum validates standardized clinical reasons', () => {
  const validReasons = [
    'patient_deceased',
    'patient_transferred',
    'no_longer_needed',
    'found_elsewhere',
    'stock_unavailable',
    'clinical_contraindication',
    'donor_unavailable',
    'timed_out',
    'other',
  ];

  for (const reason of validReasons) {
    const res = cancellationSchema.safeParse({ reason, notes: 'Clinical note' });
    assert.strictEqual(res.success, true, `Reason ${reason} should be valid`);
  }

  const invalid = cancellationSchema.safeParse({ reason: 'custom_fake_reason' });
  assert.strictEqual(invalid.success, false, 'Arbitrary unlisted reason must fail validation');
});

test('Validation: clinicalRequisitionSchema accepts doctorPin and doctorRef structure', () => {
  const validPayload = {
    contactPhone: '08012345678',
    doctorName: 'Dr. A. Adeleke',
    doctorPhone: '08098765432',
    doctorPin: 'DOC-2026',
    resourceType: 'blood',
    bloodGroup: 'A+',
    units: 1,
    source: 'web_form',
  };

  const res = clinicalRequisitionSchema.safeParse(validPayload);
  assert.strictEqual(res.success, true);
  if (res.success) {
    assert.strictEqual(res.data.doctorPin, 'DOC-2026');
    assert.strictEqual(res.data.source, 'web_form');
  }
});

test('Validation: clinicalRequisitionSchema rejects non-Nigerian contact phone numbers', () => {
  const invalidPayload = {
    contactPhone: 'not-a-phone-number',
    doctorName: 'Dr. A. Adeleke',
    resourceType: 'blood',
    bloodGroup: 'A+',
    units: 1,
  };

  const res = clinicalRequisitionSchema.safeParse(invalidPayload);
  assert.strictEqual(res.success, false);
});
