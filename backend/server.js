require('dotenv').config();
const dns = require('dns');

// Prioritize IPv4 across the entire runtime to prevent ENETUNREACH in containers
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Fail fast on missing/weak required configuration rather than booting insecure.
const missingEnv = ['MONGODB_URI', 'JWT_SECRET'].filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Missing required environment variable(s): ${missingEnv.join(', ')}`);
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 16) {
  console.warn('⚠️  JWT_SECRET is short (<16 chars). Use a long random secret in production.');
}

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Behind a proxy/tunnel (ngrok, load balancer): trust X-Forwarded-* so
// req.protocol is 'https' and req.ip is the real client. Needed for correct
// Twilio webhook signature validation and accurate rate limiting.
app.set('trust proxy', 1);

// Security headers with permissive CSP for visual admin tools (like /api/whatsapp/qr)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", '*'],
      },
    },
  })
);

// Silently handle browser favicon requests
app.get('/favicon.ico', (req, res) => res.status(204).end());

// CORS: allow configured frontend origins, Render cloud deployments (*.onrender.com), and local dev.
const envOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5000',
];

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));

function isOriginAllowed(origin) {
  if (!origin) return true; // non-browser clients (curl, mobile, webhooks, Twilio, health checks)
  const clean = origin.trim().replace(/\/+$/, '');

  // Explicitly configured origins (including local dev and FRONTEND_ORIGINS)
  if (allowedOrigins.includes(clean)) return true;

  // Allow all Render services (*.onrender.com) so dynamic service hashes (e.g. sbb-web-xxxx.onrender.com) match
  if (/^https:\/\/[a-zA-Z0-9_-]+\.onrender\.com$/i.test(clean)) return true;

  // Allow any localhost / 127.0.0.1 port (e.g. localhost:3000, 3001, etc.)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) return true;

  // Allow Vercel or Netlify preview deployments
  if (/^https:\/\/[a-zA-Z0-9_-]+\.(vercel\.app|netlify\.app)$/i.test(clean)) return true;

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      console.warn(`[CORS] Blocked request from unauthorized origin: "${origin}"`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token', 'X-Requested-With'],
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const { expireDueBatches } = require('./services/inventoryService');
const { refreshDonorEligibility } = require('./services/eligibilityService');
const { sendDueAppointmentReminders } = require('./services/notificationService');

// Connect to MongoDB, then run (and schedule) the background jobs.
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('MongoDB connected');

    // Ensure all inventory hospitalId references are stored as native ObjectIds
    const Inventory = require('./models/Inventory');
    Inventory.find({}).then(async (items) => {
      for (const item of items) {
        if (item.hospitalId && !(item.hospitalId instanceof mongoose.Types.ObjectId)) {
          if (mongoose.Types.ObjectId.isValid(item.hospitalId)) {
            item.hospitalId = new mongoose.Types.ObjectId(item.hospitalId);
            await item.save();
          }
        }
      }
    }).catch(() => {});

    const runSweep = () =>
      expireDueBatches()
        .then((n) => n && console.log(`Expired ${n} blood batch(es)`))
        .catch((err) => console.error('Expiry sweep error:', err.message));

    const runEligibility = () =>
      refreshDonorEligibility()
        .then((n) => n && console.log(`Restored ${n} donor(s) to eligible`))
        .catch((err) => console.error('Eligibility refresh error:', err.message));

    const runReminders = () =>
      sendDueAppointmentReminders()
        .then((n) => n && console.log(`Sent ${n} appointment reminder(s)`))
        .catch((err) => console.error('Appointment reminder error:', err.message));

    runSweep();        // once on startup
    runEligibility();  // once on startup
    runReminders();    // once on startup
    setInterval(runSweep, 60 * 60 * 1000).unref();            // hourly
    setInterval(runEligibility, 24 * 60 * 60 * 1000).unref(); // daily
    setInterval(runReminders, 6 * 60 * 60 * 1000).unref();    // every 6h

    // Boot Baileys WhatsApp service if configured as provider
    const whatsappProvider = process.env.WHATSAPP_PROVIDER || 'baileys';
    if (whatsappProvider === 'baileys') {
      const { initBaileys } = require('./services/baileysService');
      initBaileys().catch((err) => console.error('Baileys init error:', err.message));
    }
  })
  .catch(err => console.error('MongoDB connection error:', err));

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,                  // 20 attempts per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Import routes
const inventoryRoutes = require('./routes/inventory');
const donorRoutes = require('./routes/donors');
const whatsappRoutes = require('./routes/whatsapp');
const hospitalRoutes = require('./routes/hospitals');
const authRoutes = require('./routes/auth');
const patientRequestRoutes = require('./routes/patientRequests');
const donorAuthRoutes = require('./routes/donorAuth');
const donorAppointmentRoutes = require('./routes/donorAppointments');
const resourceRequestRoutes = require('./routes/resourceRequests');
const sosRoutes = require('./routes/sos');
const analyticsRoutes = require('./routes/analytics');
const appointmentRoutes = require('./routes/appointments');
const forecastRoutes = require('./routes/forecast');
const auditRoutes = require('./routes/audit');
const badgeRoutes = require('./routes/badges');

// Mount routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/donors', publicWriteLimiter, donorRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/hospitals', hospitalRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/patient-requests', publicWriteLimiter, patientRequestRoutes);
app.use('/api/donor/auth', authLimiter, donorAuthRoutes);
app.use('/api/donor/appointments', donorAppointmentRoutes);
app.use('/api/resource-requests', resourceRequestRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/forecast', forecastRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/badges', badgeRoutes);

const { getFrontendBaseUrl } = require('./utils/frontendUrl');

// Gracefully redirect any accidental hits for frontend routes (e.g. password resets or verification links sent before URL fix)
app.get([
  '/reset-password',
  '/donor/reset-password',
  '/donor/verify',
  '/verify',
  '/login',
  '/donor/login',
  '/track',
  '/request',
  '/sos',
], (req, res) => {
  const frontendBase = getFrontendBaseUrl();
  const target = new URL(req.originalUrl, frontendBase);
  console.log(`[Redirect] Routing frontend request ${req.originalUrl} -> ${target.toString()}`);
  return res.redirect(302, target.toString());
});

// Health check endpoints for Render and uptime monitoring
app.get(['/', '/health'], (req, res) => {
  res.json({
    status: 'ok',
    message: 'Smart Blood Bank API is running',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler: log details server-side, return generic message.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
