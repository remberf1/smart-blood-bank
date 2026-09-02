// test-email.js — send a real branded template through the app's mailer so
// what you see in your inbox is exactly what the app sends.
//
// Usage:
//   node scripts/test-email.js                       -> welcome template to SMTP_USER
//   node scripts/test-email.js you@example.com        -> welcome template to that address
//   node scripts/test-email.js you@example.com status -> a specific template
//   templates: welcome | status | eligible | reminder
require('dotenv').config();
const {
  EMAIL_ENABLED,
  sendEmail,
  buildWelcomeEmail,
  buildRequestStatusEmail,
  buildEligibleEmail,
  buildAppointmentReminderEmail,
} = require('../services/notificationService');

const to = process.argv[2] || process.env.SMTP_USER;
const which = (process.argv[3] || 'welcome').toLowerCase();

const templates = {
  welcome: () => buildWelcomeEmail({ name: 'Test User', role: 'staff', email: to }),
  status: () =>
    buildRequestStatusEmail({
      _id: '64f0aa11bb22cc33dd44ee55',
      resourceType: 'blood',
      bloodGroup: 'O+',
      deliveryStatus: 'delivered',
      contactPhone: '+2348012345678',
    }),
  eligible: () => buildEligibleEmail({ name: 'Test User', phone: '+2348012345678' }),
  reminder: () =>
    buildAppointmentReminderEmail({ appointmentDate: new Date(Date.now() + 86400000) }, 'LUTH'),
};

async function main() {
  if (!to) {
    console.error('No recipient. Pass one as the first arg or set SMTP_USER in .env.');
    process.exit(1);
  }
  if (!EMAIL_ENABLED) {
    console.error(
      'Email is disabled — set SMTP_HOST/SMTP_USER/SMTP_PASS (and EMAIL_ENABLED != "false") in .env.'
    );
    process.exit(1);
  }
  const build = templates[which];
  if (!build) {
    console.error(`Unknown template "${which}". Choose: ${Object.keys(templates).join(', ')}`);
    process.exit(1);
  }
  const e = build();
  console.log(`Sending "${which}" template to ${to}…`);
  const result = await sendEmail(to, e.subject, e.text, e.html);
  console.log(result.sent ? `✅ Sent (id ${result.id})` : `❌ Not sent: ${result.reason}`, result.error || '');
}

main();
