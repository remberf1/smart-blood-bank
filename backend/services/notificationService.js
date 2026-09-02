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
// `html` is optional; when provided it's sent alongside `text` as a multipart
// message so HTML-capable clients see the branded version and others fall back
// to plain text (better deliverability, graceful degradation).
async function sendEmail(to, subject, text, html) {
  if (!to) return { sent: false, reason: 'no-email' };
  if (!EMAIL_ENABLED || !mailer) {
    console.log(`[email off] would email ${to}: ${subject}`);
    return { sent: false, reason: 'disabled' };
  }
  try {
    const msg = { from: EMAIL_FROM, to, subject, text };
    if (html) msg.html = html;
    const info = await mailer.sendMail(msg);
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

// ---- Branded HTML email shell ----
// Email clients strip <style>/external CSS and are inconsistent with modern
// layout, so everything here is inline styles on a table-free, max-width block.
// Keep it simple and defensive — this must render in Gmail, Outlook, and mobile.

const BRAND = { red: '#c2283b', dark: '#1a1a1a', muted: '#6b7280', bg: '#f4f4f5' };

const esc = (s = '') =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Wrap message content in the branded shell.
 * @param {object} opts
 * @param {string} opts.heading  Big title line.
 * @param {string} opts.emoji    Leading emoji for the heading badge.
 * @param {string[]} opts.paragraphs  Body paragraphs (plain text; escaped).
 * @param {{label:string,url:string}} [opts.cta]  Optional call-to-action button.
 * @param {string} [opts.accent]  Accent color for the header bar (defaults to brand red).
 */
function renderEmail({ heading, emoji = '🩸', paragraphs = [], cta, accent = BRAND.red }) {
  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.dark};">${esc(p)}</p>`
    )
    .join('');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
         <tr><td style="border-radius:8px;background:${BRAND.red};">
           <a href="${esc(cta.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(cta.label)}</a>
         </td></tr>
       </table>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">${esc(heading)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:${accent};padding:20px 28px;">
          <span style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:.2px;">${emoji}&nbsp; Smart Blood Bank</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 18px;font-size:20px;line-height:1.3;color:${BRAND.dark};">${esc(heading)}</h1>
          ${body}
          ${button}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #f0f0f0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
            This is an automated message from Smart Blood Bank. Please do not reply to this email.
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:${BRAND.muted};">Every drop counts. Thank you for being part of the network. ❤️</p>
    </td></tr>
  </table>
</body>
</html>`;
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

// Email builders: { subject, text, html }
// Status → { heading, emoji, accent } for the branded HTML version.
const STATUS_PRESENTATION = {
  approved: { emoji: '🩸', accent: '#16a34a', headingSuffix: 'has been approved' },
  'in-transit': { emoji: '🚑', accent: '#2563eb', headingSuffix: 'is on the way' },
  delivered: { emoji: '✅', accent: '#16a34a', headingSuffix: 'has been delivered' },
  cancelled: { emoji: '⚠️', accent: '#d97706', headingSuffix: 'has been cancelled' },
};

function buildRequestStatusEmail(request) {
  const ref = shortRef(request._id);
  const status = request.deliveryStatus;
  const group = request.bloodGroup ? ` (${request.bloodGroup})` : '';
  const item = `${request.resourceType}${group} request${ref ? ` (ref ${ref})` : ''}`;
  const pres = STATUS_PRESENTATION[status] || { emoji: '🩸', accent: BRAND.red, headingSuffix: `is now ${status}` };
  const text = plain(buildRequestStatusMessage(request));
  const html = renderEmail({
    emoji: pres.emoji,
    accent: pres.accent,
    heading: `Your ${item} ${pres.headingSuffix}`,
    paragraphs: [text.replace(/^.*\n\n/, '')], // drop the "Smart Blood Bank" prefix line
    cta: request.contactPhone ? { label: 'Track your request', url: `${APP_URL}/track?phone=${encodeURIComponent(request.contactPhone)}` } : undefined,
  });
  return { subject: `Your blood request${ref ? ` (ref ${ref})` : ''} is ${status}`, text, html };
}

function buildEligibleEmail(donor) {
  const text = plain(buildEligibleMessage(donor));
  const html = renderEmail({
    emoji: '🩸',
    heading: "You're eligible to donate again!",
    paragraphs: [
      `${donor.name ? `Hi ${donor.name}, ` : ''}enough time has passed since your last donation — you're eligible to give blood again.`,
      'A single donation can save up to three lives. Please consider booking an appointment.',
    ],
    cta: { label: 'Book an appointment', url: `${APP_URL}/donor/dashboard` },
  });
  return { subject: "You're eligible to donate again", text, html };
}

function buildAppointmentReminderEmail(appointment, hospitalName) {
  const when = new Date(appointment.appointmentDate).toLocaleString();
  const where = hospitalName ? ` at ${hospitalName}` : '';
  const text = plain(buildAppointmentReminder(appointment, hospitalName));
  const html = renderEmail({
    emoji: '⏰',
    accent: '#2563eb',
    heading: 'Upcoming donation appointment',
    paragraphs: [
      `This is a reminder that you have a blood donation appointment${where} on ${when}.`,
      'Please remember to stay hydrated and eat well beforehand. Thank you for donating! ❤️',
    ],
    cta: { label: 'View appointment', url: `${APP_URL}/donor/dashboard` },
  });
  return { subject: 'Reminder: your blood donation appointment', text, html };
}

function buildWelcomeEmail(user) {
  const name = user.name ? `Hi ${user.name},` : 'Hello,';
  const text = `${name}

An account has been created for you on Smart Blood Bank as a ${user.role}.
Sign in here: ${APP_URL}/login

For security, set or reset your password after your first sign-in.`;
  const html = renderEmail({
    emoji: '🩸',
    heading: 'Welcome to Smart Blood Bank',
    paragraphs: [
      `${user.name ? `Hi ${user.name},` : 'Hello,'}`,
      `An account has been created for you as a ${user.role}.`,
      'For your security, please set or reset your password after your first sign-in.',
    ],
    cta: { label: 'Sign in', url: `${APP_URL}/login` },
  });
  return { subject: 'Your Smart Blood Bank account', text, html };
}

// ---- High-level helpers (fire-and-forget friendly; send both channels) ----

async function notifyRequestStatus(request) {
  if (!request) return { sent: false, reason: 'no-target' };
  const tasks = [];
  if (request.contactPhone) tasks.push(sendWhatsApp(request.contactPhone, buildRequestStatusMessage(request)));
  if (request.email) {
    const e = buildRequestStatusEmail(request);
    tasks.push(sendEmail(request.email, e.subject, e.text, e.html));
  }
  return Promise.all(tasks);
}

async function notifyDonorEligible(donor) {
  if (!donor) return { sent: false, reason: 'no-target' };
  const tasks = [];
  if (donor.phone) tasks.push(sendWhatsApp(donor.phone, buildEligibleMessage(donor)));
  if (donor.email) {
    const e = buildEligibleEmail(donor);
    tasks.push(sendEmail(donor.email, e.subject, e.text, e.html));
  }
  return Promise.all(tasks);
}

async function notifyNewUser(user) {
  if (!user || !user.email) return { sent: false, reason: 'no-email' };
  const e = buildWelcomeEmail(user);
  return sendEmail(user.email, e.subject, e.text, e.html);
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
      results.push(await sendEmail(a.donorId.email, e.subject, e.text, e.html));
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
