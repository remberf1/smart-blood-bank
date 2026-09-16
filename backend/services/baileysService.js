const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { useMongoAuthState } = require('./mongoAuthState');
const { handleIncomingMessage } = require('./botEngine');
const { normalizePhone } = require('../utils/phone');

let sock = null;
let rawQr = null;
let qrDataUrl = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting_for_qr' | 'connected'
let connectedUser = null;
let reconnectTimer = null;
let isInitializing = false;

const logger = pino({ level: 'silent' });

async function initBaileys() {
  if (isInitializing) return;
  isInitializing = true;
  connectionStatus = 'connecting';

  try {
    const { state, saveCreds, clearSession } = await useMongoAuthState('primary');
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1015901307] }));

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: ['Smart Blood Bank', 'Chrome', '1.0.0'],
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        rawQr = qr;
        connectionStatus = 'waiting_for_qr';
        try {
          qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 8 });
        } catch (err) {
          console.error('Failed to generate QR data URL:', err.message);
        }
        console.log('⚡ [Baileys] New WhatsApp QR code generated. Open /api/whatsapp/qr to scan.');
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        rawQr = null;
        qrDataUrl = null;
        const userJid = sock.user ? sock.user.id : '';
        connectedUser = userJid ? jidNormalizedUser(userJid).split('@')[0] : 'Linked';
        console.log(`✅ [Baileys] WhatsApp connected successfully as +${connectedUser}!`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'disconnected';
        connectedUser = null;

        console.log(`⚠️ [Baileys] WhatsApp connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`);

        if (statusCode === DisconnectReason.loggedOut) {
          console.log('🔒 [Baileys] Logged out from phone. Clearing session...');
          await clearSession().catch(() => {});
          rawQr = null;
          qrDataUrl = null;
        }

        if (shouldReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            isInitializing = false;
            initBaileys();
          }, 4000);
        } else {
          isInitializing = false;
        }
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        if (m.type !== 'notify') return;

        for (const msg of m.messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('@g.us')) continue;

          const fromPhone = remoteJid.split('@')[0];

          // Extract text content
          const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            '';

          // Extract location if shared
          const location = msg.message.locationMessage || msg.message.liveLocationMessage;
          const latitude = location ? location.degreesLatitude : null;
          const longitude = location ? location.degreesLongitude : null;

          const replyText = await handleIncomingMessage({
            fromPhone,
            text,
            latitude,
            longitude,
          });

          if (replyText && sock) {
            await sock.sendMessage(remoteJid, { text: replyText });
          }
        }
      } catch (msgErr) {
        console.error('Error processing Baileys incoming message:', msgErr);
      }
    });
  } catch (initErr) {
    console.error('Failed to initialize Baileys:', initErr.message);
    connectionStatus = 'disconnected';
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      isInitializing = false;
      initBaileys();
    }, 10000);
  } finally {
    isInitializing = false;
  }
}

async function sendMessage(toPhone, body) {
  if (connectionStatus !== 'connected' || !sock) {
    return { sent: false, reason: 'not_connected' };
  }

  const clean = normalizePhone(toPhone);
  if (!clean) return { sent: false, reason: 'invalid_phone' };

  const digits = clean.replace(/\D/g, '');
  const jid = `${digits}@s.whatsapp.net`;

  try {
    const result = await sock.sendMessage(jid, { text: body });
    return { sent: true, id: result?.key?.id };
  } catch (err) {
    console.error(`Baileys message to ${toPhone} failed:`, err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

function getStatus() {
  return {
    provider: 'baileys',
    status: connectionStatus,
    connected: connectionStatus === 'connected',
    phone: connectedUser,
    hasQr: Boolean(qrDataUrl),
  };
}

function getQrDataUrl() {
  return qrDataUrl;
}

module.exports = {
  initBaileys,
  sendMessage,
  getStatus,
  getQrDataUrl,
};
