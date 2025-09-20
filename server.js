require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth');
const coupleRoutes = require('./routes/couples');
const loveMomentRoutes = require('./routes/love-moments');
const photoRoutes = require('./routes/photos');
const achievementRoutes = require('./routes/achievements');
const coinRoutes = require('./routes/coins');
const statsRoutes = require('./routes/stats');
const intimacyRequestRoutes = require('./routes/intimacy-requests');

// Import database and middleware
const db = require('./database/db');
const { requestLogger, errorHandler, asyncHandler } = require('./middleware/logging');

const app = express();
const PORT = process.env.PORT || 8080;

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

// Session configuration
app.use(session({
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
}));

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      connectSrc: ["'self'", "https:"]
    }
  }
}));

// CORS configuration for development
if (process.env.NODE_ENV === 'development') {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    credentials: true
  }));
}

app.use(limiter);
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
// Additional mount for intimacy endpoints (frontend compatibility)
app.use('/api/intimacy', intimacyRequestRoutes);

// Serve static files from the frontend build
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React Router - serve index.html for all non-API routes
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API route not found'
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
  console.log(`📧 Email configured: ${!!process.env.RESEND_API_KEY}`);
  console.log(`🗄️  Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log(`🎨 Frontend: Serving from /public (React build)`);
  
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
