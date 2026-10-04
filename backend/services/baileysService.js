const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion, jidNormalizedUser, Browsers } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { useMongoAuthState } = require('./mongoAuthState');
const { handleIncomingMessage } = require('./botEngine');
const { normalizePhone } = require('../utils/phone');

let sock = null;
let rawQr = null;
let qrDataUrl = null;
let connectionStatus = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting_for_qr' | 'connected' | 'standby'
let connectedUser = null;
let reconnectTimer = null;
let isInitializing = false;
let qrCycleCount = 0;

const logger = pino({ level: 'silent' });

async function initBaileys() {
  if (isInitializing) return;
  isInitializing = true;
  connectionStatus = 'connecting';

  try {
    const { state, saveCreds, clearSession } = await useMongoAuthState('primary');
    const { version } = await fetchLatestBaileysVersion().catch(() => ({ version: [2, 3000, 1017531234] }));

    sock = makeWASocket({
      version,
      logger,
      printQRInTerminal: false,
      auth: state,
      browser: Browsers.ubuntu('Chrome'),
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
        qrCycleCount++;
        // Log once per cycle to prevent spamming the console every 20 seconds
        if (qrCycleCount === 1) {
          console.log('⚡ [Baileys] WhatsApp pairing QR code ready. Open /api/whatsapp/qr to scan.');
        }
      }

      if (connection === 'open') {
        connectionStatus = 'connected';
        rawQr = null;
        qrDataUrl = null;
        qrCycleCount = 0;
        const userJid = sock.user ? sock.user.id : '';
        connectedUser = userJid ? jidNormalizedUser(userJid).split('@')[0] : 'Linked';
        console.log(`✅ [Baileys] WhatsApp connected successfully as +${connectedUser}!`);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isReplaced = statusCode === DisconnectReason.connectionReplaced;
        const isTimedOut = statusCode === DisconnectReason.timedOut || statusCode === 408;
        const shouldReconnect = !isLoggedOut && !isReplaced && !isTimedOut;
        connectionStatus = isTimedOut ? 'standby' : 'disconnected';
        connectedUser = null;
        qrCycleCount = 0;

        console.log(`⚠️ [Baileys] WhatsApp connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`);

        if (isLoggedOut) {
          console.log('🔒 [Baileys] Logged out from phone. Clearing session...');
          await clearSession().catch(() => {});
          rawQr = null;
          qrDataUrl = null;
        }

        if (isReplaced) {
          console.warn('⚠️ [Baileys] Connection was replaced by another active server instance (e.g. Render vs Localhost). Halting auto-reconnect to prevent collision loop.');
        }

        if (isTimedOut) {
          rawQr = null;
          qrDataUrl = null;
          console.log('⏸️ [Baileys] QR code expired without scan. Paused in standby mode. Open /api/whatsapp/qr to wake up and generate a fresh QR.');
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
        if (!m.messages || !m.messages.length) return;

        for (const msg of m.messages) {
          if (!msg.message) continue;

          const remoteJid = msg.key.remoteJid;
          if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') {
            continue;
          }

          // Never reply to messages sent by the bot's own account / line
          if (msg.key.fromMe) continue;

          const userJid = sock.user ? jidNormalizedUser(sock.user.id) : '';
          const normalizedRemote = jidNormalizedUser(remoteJid);

          // Never reply to self chat (Note to Self / Message yourself)
          if (userJid && normalizedRemote === userJid) {
            continue;
          }

          // Unwrap modern message wrappers (ephemeral, viewOnce, etc.)
          let content = msg.message;
          while (
            content?.ephemeralMessage ||
            content?.viewOnceMessage ||
            content?.viewOnceMessageV2 ||
            content?.documentWithCaptionMessage
          ) {
            content =
              content?.ephemeralMessage?.message ||
              content?.viewOnceMessage?.message ||
              content?.viewOnceMessageV2?.message ||
              content?.documentWithCaptionMessage?.message;
          }

          // Extract text content
          const text =
            content?.conversation ||
            content?.extendedTextMessage?.text ||
            content?.imageMessage?.caption ||
            content?.videoMessage?.caption ||
            content?.buttonsResponseMessage?.selectedButtonId ||
            content?.listResponseMessage?.singleSelectReply?.selectedRowId ||
            content?.interactiveResponseMessage?.body?.text ||
            '';

          // Extract location if shared
          const location = content?.locationMessage || content?.liveLocationMessage;
          const latitude = location ? location.degreesLatitude : null;
          const longitude = location ? location.degreesLongitude : null;

          const fromPhone = normalizedRemote.split('@')[0];

          console.log(`📩 [Baileys] Received from ${fromPhone} (${remoteJid}): "${text}"`);

          const replyText = await handleIncomingMessage({
            fromPhone,
            text,
            latitude,
            longitude,
          });

          if (replyText && sock) {
            console.log(`📤 [Baileys] Sending reply to ${remoteJid}...`);
            await sock.sendMessage(remoteJid, { text: replyText });
            console.log(`✅ [Baileys] Reply delivered to ${remoteJid}`);
          }
        }
      } catch (msgErr) {
        console.error('❌ [Baileys] Error processing incoming message:', msgErr);
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

/**
 * Resets MongoDB stored credentials, cancels reconnect timers,
 * destroys the existing socket connection, and triggers a fresh pairing sequence.
 */
async function resetSession() {
  console.log('🔄 [Baileys] Manual session reset requested...');
  clearTimeout(reconnectTimer);
  rawQr = null;
  qrDataUrl = null;
  connectionStatus = 'disconnected';
  connectedUser = null;

  if (sock) {
    try {
      sock.ev.removeAllListeners('connection.update');
      sock.ev.removeAllListeners('creds.update');
      sock.ev.removeAllListeners('messages.upsert');
      sock.end();
    } catch (e) {
      // ignore
    }
    sock = null;
  }

  try {
    const { clearSession } = await useMongoAuthState('primary');
    await clearSession();
    console.log('🗑️ [Baileys] MongoDB session keys cleared successfully.');
  } catch (err) {
    console.error('Failed to clear MongoDB session keys:', err.message);
  }

  isInitializing = false;
  setTimeout(() => {
    initBaileys();
  }, 400);

  return { ok: true, message: 'Session reset and reconnect initiated' };
}

module.exports = {
  initBaileys,
  sendMessage,
  getStatus,
  getQrDataUrl,
  resetSession,
};
