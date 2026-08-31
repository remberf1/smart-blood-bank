const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildRequestStatusMessage,
  buildEligibleMessage,
  buildAppointmentReminder,
  buildRequestStatusEmail,
  buildEligibleEmail,
  buildWelcomeEmail,
} = require('../services/notificationService');

test('request status message reflects each status', () => {
  const base = { _id: 'abc123def456', resourceType: 'blood', bloodGroup: 'O+' };
  assert.match(buildRequestStatusMessage({ ...base, deliveryStatus: 'approved' }), /approved/i);
  assert.match(buildRequestStatusMessage({ ...base, deliveryStatus: 'in-transit' }), /transit/i);
  assert.match(buildRequestStatusMessage({ ...base, deliveryStatus: 'delivered' }), /delivered/i);
  assert.match(buildRequestStatusMessage({ ...base, deliveryStatus: 'cancelled' }), /cancelled/i);
});

test('request status message includes group and a short ref', () => {
  const msg = buildRequestStatusMessage({
    _id: 'aaaaaaaaaaaa123456',
    resourceType: 'blood',
    bloodGroup: 'AB-',
    deliveryStatus: 'approved',
  });
  assert.match(msg, /AB-/);
  assert.match(msg, /123456/); // last 6 of the id, upper-cased
});

test('eligible message greets the donor by name', () => {
  const msg = buildEligibleMessage({ name: 'Ada' });
  assert.match(msg, /Ada/);
  assert.match(msg, /eligible to donate again/i);
});

test('appointment reminder includes hospital name when provided', () => {
  const msg = buildAppointmentReminder({ appointmentDate: new Date('2026-09-01T10:00:00Z') }, 'Lagos General');
  assert.match(msg, /Lagos General/);
  assert.match(msg, /reminder/i);
});

test('email builders return a subject and a markdown-free body', () => {
  const statusEmail = buildRequestStatusEmail({ _id: 'abc123def456', resourceType: 'blood', bloodGroup: 'O+', deliveryStatus: 'delivered' });
  assert.match(statusEmail.subject, /delivered/i);
  assert.ok(!statusEmail.text.includes('*')); // markdown stripped for email

  const eligibleEmail = buildEligibleEmail({ name: 'Ada' });
  assert.match(eligibleEmail.subject, /eligible/i);
  assert.match(eligibleEmail.text, /Ada/);
});

test('welcome email names the role and a login link', () => {
  const e = buildWelcomeEmail({ name: 'Bola', role: 'admin', email: 'bola@x.com' });
  assert.match(e.subject, /account/i);
  assert.match(e.text, /admin/);
  assert.match(e.text, /login/i);
});
