require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const { supportEmail: SUPPORT_EMAIL } = require('./lib/supportContact.json');

const pgSession = require('connect-pg-simple')(session);

const { logInfo, logError } = require('./lib/logger');

const authRoutes = require('./routes/auth');
const coupleRoutes = require('./routes/couples');
const loveMomentRoutes = require('./routes/love-moments');
const cycleRecordRoutes = require('./routes/cycle-records');
const dayStatusRoutes = require('./routes/day-status');
const photoRoutes = require('./routes/photos');
const achievementRoutes = require('./routes/achievements');
const coinRoutes = require('./routes/coins');
const statsRoutes = require('./routes/stats');
const intimacyRequestRoutes = require('./routes/intimacy-requests');
const pairingRequestRoutes = require('./routes/pairing-requests');
const customScriptsRoutes = require('./routes/custom-scripts');
const intimacyPlansRoutes = require('./routes/intimacy-plans');
const guestAiRoutes = require('./routes/guest-ai');
const customGiftsRoutes = require('./routes/custom-gifts');
const wallRoutes = require('./routes/wall');
const journeyRoutes = require('./routes/journey');
const eventRoutes = require('./routes/events');
const eventClosureRoutes = require('./routes/event-closure');
const conflictInterventionRoutes = require('./routes/conflict-intervention');
const deepDiveRoutes = require('./routes/deep-dive');
const aiCompanionRoutes = require('./routes/ai-companions');
const aiUsageRoutes = require('./routes/ai-usage');
const storyRoutes = require('./routes/stories');
const playbookRoutes = require('./routes/playbooks');
const playbookPages = require('./lib/playbooks/render');
const pollRoutes = require('./routes/polls');
const lineRoutes = require('./routes/line');
const scriptFavoritesRoutes = require('./routes/script-favorites');
const marketplaceRoutes = require('./routes/marketplace');
const marketplaceBotRoutes = require('./routes/marketplace-bot');
const billingRoutes = require('./routes/billing');
const therapistRoutes = require('./routes/therapists');
const feedbackRoutes = require('./routes/feedback');
const aiFeedbackRoutes = require('./routes/ai-feedback');
const assessmentRoutes = require('./routes/assessments');
const relationshipRoutes = require('./routes/relationship');
const marriageCheckupRoutes = require('./routes/marriage-checkups');
const activityRoutes = require('./routes/activity');
const emailRoutes = require('./routes/email');
const adminRoutes = require('./routes/admin');

const db = require('./database/db');
const { requestLogger, errorHandler, asyncHandler } = require('./middleware/logging');
const { requestContext } = require('./middleware/request-context');
const { JWT_EXPIRES_IN, JWT_EXPIRES_IN_MS } = require('./middleware/auth');
const { adminAuth } = require('./middleware/adminAuth');
const { localeMiddleware } = require('./middleware/locale');

const app = express();
const PORT = process.env.PORT || 8080;

if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

const canonicalHost = (() => {
  try { return new URL(process.env.FRONTEND_URL).hostname; } catch { return null; }
})();
const isNoindexEnv = !!canonicalHost && canonicalHost.endsWith('.appspot.com');
if (process.env.NODE_ENV === 'production' && canonicalHost) {
  app.use((req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/api/')) return next();
    if (isNoindexEnv) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      return next();
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.hostname !== canonicalHost) {
      logInfo('Canonical host redirect', { fromHost: req.hostname, path: req.path });
      return res.redirect(301, `https://${canonicalHost}${req.originalUrl}`);
    }
    next();
  });
}

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

if (process.env.NODE_ENV === 'production') {
  sessionConfig.store = new pgSession({
    pool: db.pool,
    tableName: 'user_sessions'
  });
}

app.use(session(sessionConfig));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      mediaSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "https:"],
      formAction: [
        "'self'",
        "https://payment-stage.ecpay.com.tw", "https://payment.ecpay.com.tw",
        "https://ccore.newebpay.com", "https://core.newebpay.com",
      ]
    }
  }
}));

if (['development', 'test'].includes(process.env.NODE_ENV)) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
    credentials: true
  }));
}

app.use(bodyParser.json({
  limit: '10mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestContext);

app.use(requestLogger);

app.get('/health', (req, res) => {
  let dbIsLocal = false;
  try {
    dbIsLocal = ['localhost', '127.0.0.1', '::1'].includes(new URL(process.env.DATABASE_URL).hostname);
  } catch { }
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    dbIsLocal,
    version: require('./package.json').version
  });
});

app.use('/api', localeMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/couples', coupleRoutes);
app.use('/api/love-moments', loveMomentRoutes);
app.use('/api/cycle-records', cycleRecordRoutes);
app.use('/api/day-status', dayStatusRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/coins', coinRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/intimacy-requests', intimacyRequestRoutes);
app.use('/api/intimacy-plans', intimacyPlansRoutes);
app.use('/api/guest-ai', guestAiRoutes);
app.use('/api/pairing-requests', pairingRequestRoutes);
app.use('/api/custom-scripts', customScriptsRoutes);
app.use('/api/custom-gifts', customGiftsRoutes);
app.use('/api/wall', wallRoutes);
app.use('/api/journey', journeyRoutes);
app.use('/api/events', eventClosureRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/conflict', conflictInterventionRoutes);
app.use('/api/deep-dive', deepDiveRoutes);
app.use('/api/ai-companions', aiCompanionRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/playbooks', playbookRoutes);
app.use('/api/stories', storyRoutes.router);
app.use('/api/admin/stories', adminAuth, storyRoutes.adminRouter);
app.use('/api/polls', pollRoutes.router);
app.use('/api/admin/polls', adminAuth, pollRoutes.adminRouter);
app.post('/api/line/webhook', lineRoutes.webhookHandler);
app.use('/api/line', lineRoutes.router);
app.use('/api/script-favorites', scriptFavoritesRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/bot/marketplace', marketplaceBotRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/intimacy', intimacyRequestRoutes);

app.use('/api/therapists', therapistRoutes.router);
app.use('/api/admin/therapists', adminAuth, therapistRoutes.adminRouter);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ai-feedback', aiFeedbackRoutes);
app.use('/api/assessments', assessmentRoutes);
app.use('/api/relationship', relationshipRoutes);
app.use('/api/marriage-checkups', marriageCheckupRoutes);
app.use('/api/activity', activityRoutes);
app.use('/api/email', emailRoutes);

app.use('/api', adminRoutes.publicRouter);
app.use('/api/admin', adminAuth, adminRoutes.adminApiRouter);
app.get('/admin', adminAuth, adminRoutes.htmlHandler);

const publicPageCache = new Map();
function servePublicPage(file, logEvent) {
  return (req, res) => {
    if (!publicPageCache.has(file)) {
      publicPageCache.set(
        file,
        fs
          .readFileSync(path.join(__dirname, 'public', file), 'utf8')
          .replace(/\{\{SUPPORT_EMAIL\}\}/g, SUPPORT_EMAIL)
      );
    }
    if (logEvent) {
      logInfo(logEvent, {
        path: req.path,
        lang: typeof req.query.lang === 'string' ? req.query.lang.slice(0, 8) : null,
        acceptLanguage: (req.get('accept-language') || '').slice(0, 32),
      });
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.type('html').send(publicPageCache.get(file));
  };
}

app.get(['/pricing', '/membership', '/plans', '/pricing.html'], servePublicPage('pricing.html'));

app.get(['/support', '/support.html'], servePublicPage('support.html', 'support.page_view'));

app.get(['/privacy', '/privacy-policy', '/privacy.html'], servePublicPage('privacy.html', 'privacy.page_view'));

app.get(['/therapist-signup', '/become-a-therapist'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'therapist-signup.html'));
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  if (isNoindexEnv) {
    return res.send('User-agent: *\nDisallow: /\n');
  }
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    '',
    `Sitemap: https://${canonicalHost || 'twogether.fun'}/sitemap.xml`,
    ''
  ].join('\n'));
});

let spaTemplateCache = null;
function spaTemplate() {
  if (spaTemplateCache) return spaTemplateCache;
  try {
    const html = fs
      .readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf8')
      .replace(/(src|href)="\.\/assets\//g, '$1="/assets/');
    if (process.env.NODE_ENV === 'production') spaTemplateCache = html;
    return html;
  } catch {
    return null;
  }
}
const playbookLocale = (req) => (req.query.lang === 'en' ? 'en' : 'zh-TW');
app.get(['/playbooks', '/playbooks/'], (req, res, next) => {
  const template = spaTemplate();
  if (!template) return next();
  logInfo('playbooks.page_view', { page: 'library', lang: playbookLocale(req) });
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(playbookPages.renderLibrary(template, { locale: playbookLocale(req), host: canonicalHost }));
});
app.get('/playbooks/:slug', (req, res, next) => {
  const template = spaTemplate();
  if (!template) return next();
  const html = playbookPages.renderPlaybook(template, req.params.slug, { locale: playbookLocale(req), host: canonicalHost });
  if (!html) {
    logInfo('playbooks.page_not_found', { slug: String(req.params.slug).slice(0, 80) });
    return res.status(404).type('html').send(template);
  }
  logInfo('playbooks.page_view', { page: 'detail', slug: req.params.slug, lang: playbookLocale(req) });
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html);
});

let sitemapCache = null;
app.get('/sitemap.xml', (req, res) => {
  if (!sitemapCache) {
    const base = fs.readFileSync(path.join(__dirname, 'public', 'sitemap.xml'), 'utf8');
    sitemapCache = base.replace('</urlset>', `${playbookPages.sitemapEntries(canonicalHost)}\n</urlset>`);
  }
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/xml').send(sitemapCache);
});

app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, path) => {
    if (path.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      message: 'API route not found'
    });
  }
  
  if (req.path.startsWith('/assets/')) {
    return res.status(404).json({
      success: false,
      message: 'Asset not found'
    });
  }
  
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.use(errorHandler);

app.listen(PORT, async () => {
  logInfo('Twogether app started', {
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    emailConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_USER,
    databaseConfigured: !!process.env.DATABASE_URL,
  });

  try {
    await db.query('SELECT NOW()');
    logInfo('Database connection successful');
  } catch (error) {
    logError('Database connection failed', { err: error.message });
  }
});

process.on('SIGTERM', () => {
  logInfo('SIGTERM received, shutting down');
  process.exit(0);
});

process.on('SIGINT', () => {
  logInfo('SIGINT received, shutting down');
  process.exit(0);
});

module.exports = app;
