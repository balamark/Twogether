require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

// PostgreSQL session store for production
const pgSession = require('connect-pg-simple')(session);

const { logInfo, logError } = require('./lib/logger');

// Import routes
const authRoutes = require('./routes/auth');
const coupleRoutes = require('./routes/couples');
const loveMomentRoutes = require('./routes/love-moments');
const cycleRecordRoutes = require('./routes/cycle-records');
const photoRoutes = require('./routes/photos');
const achievementRoutes = require('./routes/achievements');
const coinRoutes = require('./routes/coins');
const statsRoutes = require('./routes/stats');
const intimacyRequestRoutes = require('./routes/intimacy-requests');
const pairingRequestRoutes = require('./routes/pairing-requests');
const customScriptsRoutes = require('./routes/custom-scripts');
const customGiftsRoutes = require('./routes/custom-gifts');
const wallRoutes = require('./routes/wall');
const eventRoutes = require('./routes/events');
const scriptFavoritesRoutes = require('./routes/script-favorites');
const marketplaceRoutes = require('./routes/marketplace');
const billingRoutes = require('./routes/billing');
const therapistRoutes = require('./routes/therapists');
const feedbackRoutes = require('./routes/feedback');
const adminRoutes = require('./routes/admin');

// Import database and middleware
const db = require('./database/db');
const { requestLogger, errorHandler, asyncHandler } = require('./middleware/logging');
const { JWT_EXPIRES_IN, JWT_EXPIRES_IN_MS } = require('./middleware/auth');
const { adminAuth } = require('./middleware/adminAuth');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust exactly one hop for Google Cloud (GAE adds a single X-Forwarded-For
// frontend). `true` would trust ALL hops, letting any client spoof their IP
// via X-Forwarded-For — that breaks the funnel's distinct-IP signal and any
// IP-based rate limiting. Adjust if a CDN ever sits in front of GAE.
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Session configuration. Cookie maxAge is kept in sync with the JWT TTL
// (JWT_EXPIRES_IN) so the express-session cookie and the JWT can't expire at
// wildly different times — both are the "session lifespan" from the user's
// perspective.
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'twogether-session-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: JWT_EXPIRES_IN_MS,
    sameSite: 'lax'
  },
  name: 'twogether.session'
};

console.log(`🔐 Session TTL: ${JWT_EXPIRES_IN} (${JWT_EXPIRES_IN_MS}ms)`);

// Use PostgreSQL session store in production to avoid memory leaks
if (process.env.NODE_ENV === 'production') {
  sessionConfig.store = new pgSession({
    pool: db.pool,
    tableName: 'user_sessions'
  });
}

app.use(session(sessionConfig));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Google Fonts stylesheet is hosted on fonts.googleapis.com (style-src)
      // and the actual font files are served from fonts.gstatic.com (font-src).
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // blob: is needed for URL.createObjectURL() previews (e.g. thumbnail
      // preview in the custom script upload/edit modal).
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "https:"],
      // Allow the premium checkout form to POST to ECPay's hosted payment page.
      formAction: ["'self'", "https://payment-stage.ecpay.com.tw", "https://payment.ecpay.com.tw"]
    }
  }
}));

// CORS configuration for development and test (frontend on :5174 → backend on :8080)
if (['development', 'test'].includes(process.env.NODE_ENV)) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    credentials: true
  }));
}

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Add comprehensive request/response logging
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/couples', coupleRoutes);
app.use('/api/love-moments', loveMomentRoutes);
app.use('/api/cycle-records', cycleRecordRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/intimacy-requests', intimacyRequestRoutes);
app.use('/api/pairing-requests', pairingRequestRoutes);
app.use('/api/custom-scripts', customScriptsRoutes);
app.use('/api/custom-gifts', customGiftsRoutes);
app.use('/api/wall', wallRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/script-favorites', scriptFavoritesRoutes);
app.use('/api/marketplace', marketplaceRoutes);
// Billing: /status + /checkout are JWT-protected inside the router; the
// /ecpay/callback (server-to-server) and /ecpay/return (browser POST-back) are
// intentionally public — ECPay can't present a JWT. Auth is applied per-route.
app.use('/api/billing', billingRoutes);
// Additional mount for intimacy endpoints (frontend compatibility)
app.use('/api/intimacy', intimacyRequestRoutes);

// Human therapist directory. The public router handles browse + apply
// (optionalAuth inside) and JWT-protected consultation booking. Admin
// moderation (approve/reject applications) is Basic-Auth gated like the rest
// of /api/admin/*.
app.use('/api/therapists', therapistRoutes.router);
app.use('/api/admin/therapists', adminAuth, therapistRoutes.adminRouter);
app.use('/api/feedback', feedbackRoutes);

// Admin funnel dashboard. The public router (POST /api/track/landing) is the
// anonymous beacon fired from the frontend on the logged-out landing render.
// The /api/admin/* JSON endpoints and the /admin HTML page are gated by
// HTTP Basic Auth (ADMIN_PASSWORD env var).
app.use('/api', adminRoutes.publicRouter);
app.use('/api/admin', adminAuth, adminRoutes.adminApiRouter);
app.get('/admin', adminAuth, adminRoutes.htmlHandler);

// Public, no-login sales/pricing page. ECPay (綠界) requires a publicly
// reachable URL that shows the products for sale, their prices, and the
// refund/contact policy — WITHOUT any login. The SPA gates most views behind
// auth, so this explicit route (registered before the static/catch-all) serves
// a self-contained static page that is always public. Prices here MUST stay in
// sync with the PLANS catalog in routes/billing.js.
app.get(['/pricing', '/membership', '/plans'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'pricing.html'));
});

// Public, no-login therapist recruitment / sign-up page. The SPA gates most
// views behind auth, so this explicit route (registered before the static
// catch-all) serves a self-contained static form that POSTs to the public
// /api/therapists/apply endpoint. Anyone can apply without an account.
app.get(['/therapist-signup', '/become-a-therapist'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'therapist-signup.html'));
});

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, path) => {
    // Cache assets with hash for a year
    if (path.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Don't cache HTML files
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Handle React Router - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API route not found'
    });
  }
  
  // Don't serve index.html for static asset requests
  if (req.path.startsWith('/assets/')) {
    return res.status(404).json({
      success: false,
      message: 'Asset not found'
    });
  }
  
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Error handling middleware (comprehensive logging)
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  logInfo('Twogether app started', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    emailConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    databaseConfigured: !!process.env.DATABASE_URL,
  });

  // Test database connection
  try {
    await db.query('SELECT NOW()');
    logInfo('Database connection successful');
  } catch (error) {
    logError('Database connection failed', { err: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logInfo('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('SIGINT received, shutting down');
  process.exit(0);
});

module.exports = app;
