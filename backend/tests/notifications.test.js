const { test } = require('node:test');
const assert = require('node:assert');
const {
  buildRequestStatusMessage,
  buildEligibleMessage,
  buildAppointmentReminder,
  buildRequestStatusEmail,
  buildEligibleEmail,
  buildAppointmentReminderEmail,
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

test('every email builder returns a subject, plain text, and branded html', () => {
  const builders = [
    buildRequestStatusEmail({ _id: 'abc123def456', resourceType: 'blood', bloodGroup: 'O+', deliveryStatus: 'delivered', contactPhone: '+2348012345678' }),
    buildEligibleEmail({ name: 'Ada', phone: '+2348012345678' }),
    buildAppointmentReminderEmail({ appointmentDate: new Date('2026-09-01T10:00:00Z') }, 'LUTH'),
    buildWelcomeEmail({ name: 'Bola', role: 'admin', email: 'bola@x.com' }),
  ];
  for (const e of builders) {
    assert.ok(e.subject && e.subject.length > 0, 'has subject');
    assert.ok(e.text && e.text.length > 0, 'has plain text');
    assert.ok(e.html && e.html.length > 0, 'has html');
    assert.match(e.html, /<!DOCTYPE html>/i, 'html is a full document');
    assert.match(e.html, /Smart Blood Bank/, 'html carries the brand');
    assert.ok(!e.text.includes('<'), 'plain text is free of html tags');
  }
});

test('html email escapes interpolated values to prevent injection', () => {
  const e = buildWelcomeEmail({ name: 'Bola <script>alert(1)</script>', role: 'admin', email: 'x@x.com' });
  assert.ok(!e.html.includes('<script>'), 'raw script tag is escaped');
  assert.match(e.html, /&lt;script&gt;/, 'angle brackets are entity-encoded');
});

test('status emails carry a status-appropriate heading', () => {
  const delivered = buildRequestStatusEmail({ _id: 'abc123def456', resourceType: 'blood', bloodGroup: 'O+', deliveryStatus: 'delivered' });
  assert.match(delivered.html, /delivered/i);
  const transit = buildRequestStatusEmail({ _id: 'abc123def456', resourceType: 'blood', bloodGroup: 'O+', deliveryStatus: 'in-transit' });
  assert.match(transit.html, /on the way|transit/i);
});
