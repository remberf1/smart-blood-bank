const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { handleIncomingMessage } = require('../services/botEngine');
const baileysService = require('../services/baileysService');

const MessagingResponse = twilio.twiml ? twilio.twiml.MessagingResponse : null;

// Validate incoming requests if using Twilio
const validateTwilio =
  process.env.TWILIO_VALIDATE === 'false' || !process.env.TWILIO_AUTH_TOKEN
    ? (req, res, next) => next()
    : twilio.webhook(
        process.env.TWILIO_WEBHOOK_URL ? { url: process.env.TWILIO_WEBHOOK_URL } : {}
      );

/**
 * GET /api/whatsapp/status
 * Returns current provider status and connection state.
 */
router.get('/status', (req, res) => {
  const provider = process.env.WHATSAPP_PROVIDER || 'baileys';
  const baileysStatus = baileysService.getStatus();
  res.json({
    activeProvider: provider,
    baileys: baileysStatus,
    twilio: {
      configured: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_WHATSAPP_NUMBER),
      fromNumber: process.env.TWILIO_WHATSAPP_NUMBER || null,
    },
  });
});

/**
 * GET /api/whatsapp/qr
 * Visual web QR page for linking WhatsApp via Baileys (no terminal required).
 */
router.get('/qr', (req, res) => {
  const status = baileysService.getStatus();
  const qrDataUrl = baileysService.getQrDataUrl();

  let bodyContent = '';

  if (status.connected) {
    bodyContent = `
      <div class="status-badge connected">
        <span class="dot green"></span> Connected to WhatsApp
      </div>
      <h2>Phone: +${status.phone || 'Linked Device'}</h2>
      <p>The Smart Blood Bank bot is live and responding to real WhatsApp messages!</p>
      <div class="tip">No Twilio sandbox or join codes needed. Anyone can message this number directly.</div>
    `;
  } else if (qrDataUrl) {
    bodyContent = `
      <div class="status-badge waiting">
        <span class="dot amber"></span> Ready to Pair
      </div>
      <h2>Scan to Connect Bot</h2>
      <p>Link your phone or a spare WhatsApp line to start sending and receiving messages.</p>
      <div class="qr-box">
        <img src="${qrDataUrl}" class="qr-img" alt="WhatsApp QR Code" />
      </div>
      <div class="steps">
        <strong>How to link:</strong>
        <ol>
          <li>Open WhatsApp on your phone</li>
          <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
          <li>Tap <strong>Link a Device</strong> and point your camera at this QR code</li>
        </ol>
      </div>
    `;
  } else {
    bodyContent = `
      <div class="status-badge connecting">
        <span class="dot blue"></span> Initializing WhatsApp Socket...
      </div>
      <h2>Connecting...</h2>
      <p>Generating a fresh pairing QR code. This page will automatically refresh.</p>
      <div class="spinner"></div>
    `;
  }

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Blood Bank — WhatsApp Connector</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #0f172a;
    }
    .card {
      background: #ffffff;
      width: 100%;
      max-width: 440px;
      border-radius: 20px;
      padding: 32px 28px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(0,0,0,0.06), 0 8px 10px -6px rgba(0,0,0,0.04);
      border: 1px solid #e2e8f0;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      color: #dc2626;
      font-size: 15px;
      margin-bottom: 20px;
      letter-spacing: .3px;
    }
    h2 { font-size: 20px; margin: 12px 0 8px; font-weight: 700; }
    p { font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 16px; }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 16px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .connected { background: #dcfce7; color: #166534; }
    .waiting { background: #fef3c7; color: #92400e; }
    .connecting { background: #e0f2fe; color: #0369a1; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .green { background: #22c55e; }
    .amber { background: #f59e0b; }
    .blue { background: #0ea5e9; }
    .qr-box {
      background: #f8fafc;
      border: 2px dashed #cbd5e1;
      border-radius: 16px;
      padding: 16px;
      display: inline-block;
      margin: 12px 0 16px;
    }
    .qr-img { width: 250px; height: 250px; display: block; border-radius: 8px; }
    .steps {
      background: #f1f5f9;
      border-radius: 12px;
      padding: 14px 18px;
      text-align: left;
      font-size: 13px;
      color: #334155;
    }
    .steps ol { margin: 8px 0 0 16px; }
    .steps li { margin-bottom: 4px; }
    .tip {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      color: #166534;
      padding: 12px;
      border-radius: 10px;
      font-size: 13px;
      margin-top: 14px;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #dc2626;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 24px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
  ${status.connected ? '' : '<script>setInterval(() => { fetch("/api/whatsapp/status").then(r => r.json()).then(d => { if (d.baileys?.connected || d.baileys?.hasQr) location.reload(); }); }, 4000);</script>'}
</head>
<body>
  <div class="card">
    <div class="brand">🩸 SMART BLOOD BANK</div>
    ${bodyContent}
  </div>
</body>
</html>`);
});

/**
 * POST /api/whatsapp/webhook
 * Incoming webhook endpoint for Twilio fallback.
 */
router.post('/webhook', validateTwilio, async (req, res) => {
  const incomingMsg = (req.body.Body || '').trim();
  const userPhone = (req.body.From || '').replace(/^whatsapp:/i, '');
  const latitude = req.body.Latitude ? parseFloat(req.body.Latitude) : null;
  const longitude = req.body.Longitude ? parseFloat(req.body.Longitude) : null;

  try {
    const replyText = await handleIncomingMessage({
      fromPhone: userPhone,
      text: incomingMsg,
      latitude,
      longitude,
    });

    if (MessagingResponse) {
      const twiml = new MessagingResponse();
      twiml.message(replyText);
      res.writeHead(200, { 'Content-Type': 'text/xml' });
      res.end(twiml.toString());
    } else {
      res.json({ reply: replyText });
    }
  } catch (err) {
    console.error('Error handling Twilio webhook:', err);
    res.status(500).send('<Response><Message>An error occurred.</Message></Response>');
  }
});

module.exports = router;