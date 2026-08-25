require('dotenv').config();
const twilio = require('twilio');
const { normalizePhone } = require('../utils/phone');
const DonationAppointment = require('../models/DonationAppointment');

const SID = process.env.TWILIO_ACCOUNT_SID;
const TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FROM = process.env.TWILIO_WHATSAPP_NUMBER;

// Notifications are best-effort: only enabled with valid Twilio credentials and
// not explicitly turned off. Without them, sends become logged no-ops so dev,
// tests, and the main request flow are never blocked or broken.
const ENABLED =
  process.env.NOTIFICATIONS_ENABLED !== 'false' &&
  Boolean(SID && TOKEN && FROM && SID.startsWith('AC'));

let client = null;
if (ENABLED) {
  try {
    client = twilio(SID, TOKEN);
  } catch (err) {
    console.error('Twilio init failed; notifications disabled:', err.message);
  }
}

// Send a WhatsApp message. Never throws — returns a result object.
async function sendWhatsApp(toPhone, body) {
  const to = normalizePhone(toPhone);
  if (!to) return { sent: false, reason: 'no-phone' };
  if (!ENABLED || !client) {
    console.log(`[notifications off] would WhatsApp ${to}: ${body.split('\n')[0]}`);
    return { sent: false, reason: 'disabled' };
  }
  try {
    const msg = await client.messages.create({ from: FROM, to: `whatsapp:${to}`, body });
    return { sent: true, sid: msg.sid };
  } catch (err) {
    console.error(`Notification to ${to} failed:`, err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

// ---- Pure message builders (unit tested) ----

function shortRef(id) {
  return id ? id.toString().slice(-6).toUpperCase() : '';
}

function buildRequestStatusMessage(request) {
  const ref = shortRef(request._id);
  const group = request.bloodGroup ? ` (${request.bloodGroup})` : '';
  const item = `${request.resourceType}${group} request${ref ? ` (ref ${ref})` : ''}`;
  switch (request.deliveryStatus) {
    case 'approved':
      return `🩸 Smart Blood Bank\n\nGood news! Your ${item} has been *approved* and matched to a hospital. We'll keep you updated.`;
    case 'in-transit':
      return `🚑 Smart Blood Bank\n\nYour ${item} is now *in transit*.`;
    case 'delivered':
      return `✅ Smart Blood Bank\n\nYour ${item} has been *delivered*. We wish the patient a swift recovery. ❤️`;
    case 'cancelled':
      return `⚠️ Smart Blood Bank\n\nYour ${item} has been *cancelled*. Please contact the hospital for details.`;
    default:
      return `Smart Blood Bank: your ${item} status is now ${request.deliveryStatus}.`;
  }
}

function buildEligibleMessage(donor) {
  const name = donor.name ? `Hi ${donor.name}, ` : '';
  return `🩸 Smart Blood Bank\n\n${name}you're *eligible to donate again*! Enough time has passed since your last donation. Please consider booking an appointment to help save lives. ❤️`;
}

function buildAppointmentReminder(appointment, hospitalName) {
  const when = new Date(appointment.appointmentDate).toLocaleString();
  const where = hospitalName ? ` at ${hospitalName}` : '';
  return `⏰ Smart Blood Bank\n\nReminder: you have a blood donation appointment${where} on ${when}. Thank you for donating! ❤️`;
}

// ---- High-level helpers (fire-and-forget friendly) ----

async function notifyRequestStatus(request) {
  if (!request || !request.contactPhone) return { sent: false, reason: 'no-phone' };
  return sendWhatsApp(request.contactPhone, buildRequestStatusMessage(request));
}

async function notifyDonorEligible(donor) {
  if (!donor || !donor.phone) return { sent: false, reason: 'no-phone' };
  return sendWhatsApp(donor.phone, buildEligibleMessage(donor));
}

/**
 * Send reminders for scheduled appointments coming up within `withinHours`
 * that haven't been reminded yet. Marks reminderSent only on a real send so a
 * disabled run retries later. Returns the count sent.
 */
async function sendDueAppointmentReminders(withinHours = 24) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  const appts = await DonationAppointment.find({
    status: 'scheduled',
    reminderSent: { $ne: true },
    appointmentDate: { $gt: now, $lte: cutoff },
  })
    .populate('donorId', 'name phone')
    .populate('hospitalId', 'name');

  let sent = 0;
  for (const a of appts) {
    if (!a.donorId || !a.donorId.phone) continue;
    const result = await sendWhatsApp(a.donorId.phone, buildAppointmentReminder(a, a.hospitalId && a.hospitalId.name));
    if (result.sent) {
      a.reminderSent = true;
      await a.save();
      sent++;
    }
  }
  return sent;
}

module.exports = {
  ENABLED,
  sendWhatsApp,
  notifyRequestStatus,
  notifyDonorEligible,
  sendDueAppointmentReminders,
  buildRequestStatusMessage,
  buildEligibleMessage,
  buildAppointmentReminder,
};
