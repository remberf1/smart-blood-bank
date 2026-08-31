require('dotenv').config();
const twilio = require('twilio');
const nodemailer = require('nodemailer');
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

// ---- Email channel (SMTP via nodemailer), same best-effort/disabled-safe rules ----
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const EMAIL_FROM = process.env.SMTP_FROM || SMTP_USER;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const EMAIL_ENABLED =
  process.env.EMAIL_ENABLED !== 'false' && Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);

let mailer = null;
if (EMAIL_ENABLED) {
  try {
    mailer = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465, // implicit TLS on 465, STARTTLS otherwise
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } catch (err) {
    console.error('Email transport init failed; email disabled:', err.message);
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

// Send an email. Never throws — returns a result object.
async function sendEmail(to, subject, text) {
  if (!to) return { sent: false, reason: 'no-email' };
  if (!EMAIL_ENABLED || !mailer) {
    console.log(`[email off] would email ${to}: ${subject}`);
    return { sent: false, reason: 'disabled' };
  }
  try {
    const info = await mailer.sendMail({ from: EMAIL_FROM, to, subject, text });
    return { sent: true, id: info.messageId };
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

// ---- Pure message builders (unit tested) ----

function shortRef(id) {
  return id ? id.toString().slice(-6).toUpperCase() : '';
}

// Strip WhatsApp markdown (*) for plain-text email bodies.
const plain = (s) => s.replace(/\*/g, '');

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

// Email builders: { subject, text }
function buildRequestStatusEmail(request) {
  const ref = shortRef(request._id);
  const status = request.deliveryStatus;
  return {
    subject: `Your blood request${ref ? ` (ref ${ref})` : ''} is ${status}`,
    text: plain(buildRequestStatusMessage(request)),
  };
}

function buildEligibleEmail(donor) {
  return { subject: "You're eligible to donate again", text: plain(buildEligibleMessage(donor)) };
}

function buildAppointmentReminderEmail(appointment, hospitalName) {
  return { subject: 'Reminder: your blood donation appointment', text: plain(buildAppointmentReminder(appointment, hospitalName)) };
}

function buildWelcomeEmail(user) {
  const name = user.name ? `Hi ${user.name},` : 'Hello,';
  return {
    subject: 'Your Smart Blood Bank account',
    text: `${name}

An account has been created for you on Smart Blood Bank as a ${user.role}.
Sign in here: ${APP_URL}/login

For security, set or reset your password after your first sign-in.`,
  };
}

// ---- High-level helpers (fire-and-forget friendly; send both channels) ----

async function notifyRequestStatus(request) {
  if (!request) return { sent: false, reason: 'no-target' };
  const tasks = [];
  if (request.contactPhone) tasks.push(sendWhatsApp(request.contactPhone, buildRequestStatusMessage(request)));
  if (request.email) {
    const e = buildRequestStatusEmail(request);
    tasks.push(sendEmail(request.email, e.subject, e.text));
  }
  return Promise.all(tasks);
}

async function notifyDonorEligible(donor) {
  if (!donor) return { sent: false, reason: 'no-target' };
  const tasks = [];
  if (donor.phone) tasks.push(sendWhatsApp(donor.phone, buildEligibleMessage(donor)));
  if (donor.email) {
    const e = buildEligibleEmail(donor);
    tasks.push(sendEmail(donor.email, e.subject, e.text));
  }
  return Promise.all(tasks);
}

async function notifyNewUser(user) {
  if (!user || !user.email) return { sent: false, reason: 'no-email' };
  const e = buildWelcomeEmail(user);
  return sendEmail(user.email, e.subject, e.text);
}

/**
 * Send reminders for scheduled appointments coming up within `withinHours`
 * that haven't been reminded yet, via WhatsApp and email. Marks reminderSent
 * only when at least one channel sends, so a fully-disabled run retries later.
 * Returns the count reminded.
 */
async function sendDueAppointmentReminders(withinHours = 24) {
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinHours * 60 * 60 * 1000);
  const appts = await DonationAppointment.find({
    status: 'scheduled',
    reminderSent: { $ne: true },
    appointmentDate: { $gt: now, $lte: cutoff },
  })
    .populate('donorId', 'name phone email')
    .populate('hospitalId', 'name');

  let sent = 0;
  for (const a of appts) {
    if (!a.donorId) continue;
    const hospitalName = a.hospitalId && a.hospitalId.name;
    const results = [];
    if (a.donorId.phone) results.push(await sendWhatsApp(a.donorId.phone, buildAppointmentReminder(a, hospitalName)));
    if (a.donorId.email) {
      const e = buildAppointmentReminderEmail(a, hospitalName);
      results.push(await sendEmail(a.donorId.email, e.subject, e.text));
    }
    if (results.some((r) => r && r.sent)) {
      a.reminderSent = true;
      await a.save();
      sent++;
    }
  }
  return sent;
}

module.exports = {
  ENABLED,
  EMAIL_ENABLED,
  sendWhatsApp,
  sendEmail,
  notifyRequestStatus,
  notifyDonorEligible,
  notifyNewUser,
  sendDueAppointmentReminders,
  buildRequestStatusMessage,
  buildEligibleMessage,
  buildAppointmentReminder,
  buildRequestStatusEmail,
  buildEligibleEmail,
  buildAppointmentReminderEmail,
  buildWelcomeEmail,
};
