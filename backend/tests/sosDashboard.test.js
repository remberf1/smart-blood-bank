const test = require('node:test');
const assert = require('node:assert/strict');
const SOSRequest = require('../models/SOSRequest');
const { formatSosCard, handleTrackingLookup } = require('../services/botEngine');

test('SOSRequest schema: supports referenceId, doctorName, hospitalName, and componentNeeded', () => {
  const sos = new SOSRequest({
    bloodGroup: 'O-',
    referenceId: 'SOS-TEST1',
    doctorName: 'Dr. Adeleke',
    doctorPhone: '+2348012345678',
    hospitalName: 'LUTH',
    componentNeeded: 'WHOLE_BLOOD',
    userLocation: { lat: 6.5244, lon: 3.3792 },
    userPhone: '+2348012345678',
    radiusKm: 15,
    status: 'pending',
  });

  assert.equal(sos.bloodGroup, 'O-');
  assert.equal(sos.referenceId, 'SOS-TEST1');
  assert.equal(sos.doctorName, 'Dr. Adeleke');
  assert.equal(sos.doctorPhone, '+2348012345678');
  assert.equal(sos.hospitalName, 'LUTH');
  assert.equal(sos.componentNeeded, 'WHOLE_BLOOD');
  assert.equal(sos.status, 'pending');
});

test('SOSRequest schema: default status is pending and createdAt is populated', () => {
  const sos = new SOSRequest({
    bloodGroup: 'A+',
  });

  assert.equal(sos.status, 'pending');
  assert.ok(sos.createdAt instanceof Date);
});

test('formatSosCard: formats pending SOS alert with reference ID and clinical details', () => {
  const mockSos = {
    bloodGroup: 'O-',
    referenceId: 'SOS-9X2A1',
    status: 'pending',
    hospitalName: 'LUTH',
    doctorName: 'Dr. Adeleke',
    componentNeeded: 'WHOLE_BLOOD',
    radiusKm: 15,
    donorsAlerted: [{ phone: '+2348011111111' }, { phone: '+2348022222222' }],
    donorsResponded: [],
    createdAt: new Date(),
  };

  const card = formatSosCard(mockSos);
  assert.match(card, /EMERGENCY SOS BROADCAST — O-/);
  assert.match(card, /SOS-9X2A1/);
  assert.match(card, /PENDING/);
  assert.match(card, /LUTH/);
  assert.match(card, /Dr\. Adeleke/);
  assert.match(card, /Donors Alerted: 2 within 15km/);
  assert.match(card, /Awaiting donor confirmations/);
});

test('formatSosCard: formats confirmed donor response when donor confirms', () => {
  const mockSos = {
    bloodGroup: 'A+',
    referenceId: 'SOS-CONF1',
    status: 'resolved',
    hospitalName: 'Babcock',
    radiusKm: 25,
    donorsAlerted: [{ phone: '+2348011111111' }],
    donorsResponded: [{ response: 'yes', timestamp: new Date() }],
    createdAt: new Date(),
  };

  const card = formatSosCard(mockSos);
  assert.match(card, /Confirmed Available: \*1 donor\(s\)\*/);
  assert.match(card, /RESOLVED/);
  assert.match(card, /Donor\(s\) confirmed availability/);
});
