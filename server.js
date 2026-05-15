require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');

// PostgreSQL session store for production
const pgSession = require('connect-pg-simple')(session);

// Import routes
const authRoutes = require('./routes/auth');
const coupleRoutes = require('./routes/couples');
const loveMomentRoutes = require('./routes/love-moments');
const photoRoutes = require('./routes/photos');
const achievementRoutes = require('./routes/achievements');
const coinRoutes = require('./routes/coins');
const statsRoutes = require('./routes/stats');
const intimacyRequestRoutes = require('./routes/intimacy-requests');
const pairingRequestRoutes = require('./routes/pairing-requests');
const customScriptsRoutes = require('./routes/custom-scripts');
const customGiftsRoutes = require('./routes/custom-gifts');

// Import database and middleware
const db = require('./database/db');
const { requestLogger, errorHandler, asyncHandler } = require('./middleware/logging');

const app = express();
const PORT = process.env.PORT || 8080;

// Trust proxy for Google Cloud (correct X-Forwarded-For handling behind GAE).
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', true);
}

// Session configuration
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'twogether-session-secret-2024',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  },
  name: 'twogether.session'
};

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
      connectSrc: ["'self'", "https:"]
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
app.use('/api/photos', photoRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/intimacy-requests', intimacyRequestRoutes);
app.use('/api/pairing-requests', pairingRequestRoutes);
app.use('/api/custom-scripts', customScriptsRoutes);
app.use('/api/custom-gifts', customGiftsRoutes);
// Additional mount for intimacy endpoints (frontend compatibility)
app.use('/api/intimacy', intimacyRequestRoutes);

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
  console.log(`🚀 Twogether app running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📧 Email configured: ${!!process.env.SMTP_HOST && !!process.env.SMTP_USER}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🎨 Frontend: Serving from /dist (Vite build output)`);
  
  // Test database connection
  try {
    await db.query('SELECT NOW()');
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
