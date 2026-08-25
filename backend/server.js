require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// Security headers
app.use(helmet());

// CORS: restrict to configured frontend origin(s).
// FRONTEND_ORIGINS is a comma-separated list; falls back to localhost dev.
const allowedOrigins = (process.env.FRONTEND_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // allow non-browser clients (curl, Twilio webhooks, health checks) with no Origin
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
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

// Simple health check
app.get('/', (req, res) => {
  res.json({ message: 'Smart Blood Bank API is running' });
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
