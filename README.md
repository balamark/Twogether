# Twogether - 情侶親密時光記錄 App

A modern couples app for recording intimate moments, achievements, and relationship milestones. Now built with a cost-optimized single-server architecture using Node.js + React.

## ⚡ TL;DR - Get Started in 3 Commands

```bash
cp .env.example .env          # Copy and edit with your credentials
npm install                   # Install all dependencies
npm run build && npm run dev:backend
```

Then visit: http://localhost:8080

## 🎯 What's New - Single Server Architecture

✅ **Combined Architecture**: Frontend + Backend in one Node.js instance  
✅ **Cost Optimization**: From expensive App Engine Flex → Free-tier App Engine Standard  
✅ **Simplified Deployment**: One command builds and deploys everything  
✅ **Faster Cold Starts**: Node.js starts much faster than Rust  
✅ **No CORS Issues**: Same origin for frontend and backend

## Features

- **親密記錄**: Log intimate moments with mood, duration, location, and photos
- **成就系統**: Earn badges for milestones and achievements
- **角色扮演**: Custom roleplay scripts and scenarios with predefined templates
- **親密邀請系統**: Send and respond to intimacy requests with notifications
- **替代選項**: Alternative intimate activities when requests are declined
- **通知系統**: Real-time notifications for requests and responses
- **金幣商店**: Virtual currency system for rewards
- **配對系統**: Secure partner pairing with codes
- **統計分析**: Weekly/monthly intimacy statistics
- **隱私保護**: Secure authentication and data storage

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- Lucide React for icons

### Backend
- Node.js with Express framework
- PostgreSQL database (Supabase)
- JWT authentication
- Supabase for file storage
- Docker containerization

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (or Supabase account)
- Google Cloud CLI (for deployment)

### 1. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials (required before running)
```

### 2. Install Dependencies
```bash
# Install all dependencies (both frontend and backend)
npm install
```

### 3. Development Mode

#### Option A: With Cloud Database (Supabase)
```bash
# Build frontend first
npm run build

# Start combined server (uses cloud database)
npm run dev:backend

# Visit: http://localhost:8080
```

#### Option B: With Local PostgreSQL Database
```bash
# 1. Set up local PostgreSQL database
./scripts/setup-local-db.sh

# 2. Copy your .env to .env.local and update DATABASE_URL
cp .env .env.local
# Edit .env.local to use: DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev

# 3. Run migrations to create tables
NODE_ENV=development npm run migrate

# 4. Build and start server
npm run build
NODE_ENV=development npm run dev:backend

# Visit: http://localhost:8080
```

#### Development with Hot Reload (For Frontend Changes)
```bash
# Terminal 1: Start backend API
npm run dev:backend

# Terminal 2: Start frontend dev server with hot reload
npm run dev

# Visit: http://localhost:5174 (proxies to backend on :8080)
```

### 4. Production Deployment

#### Automatic (GitHub Actions)
```bash
# Push to main branch triggers automatic deployment
git add .
git commit -m "Deploy update"
git push origin main
```

#### Manual Deployment
```bash
# Build frontend
npm run build

# Deploy to Google App Engine
gcloud app deploy

# Check deployment
gcloud app browse
```

## 🗄️ Local PostgreSQL Setup

For local development, you can use a local PostgreSQL database instead of the cloud database:

### Installation

**macOS (with Homebrew):**
```bash
brew install postgresql
brew services start postgresql
```

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### Quick Setup
```bash
# Run the automated setup script
./scripts/setup-local-db.sh

# This creates:
# - Database: twogether_dev
# - User: twogether
# - Password: twogether123
# - Connection: postgresql://twogether:twogether123@localhost:5432/twogether_dev
```

### Manual Setup
```bash
# 1. Create database user
psql postgres -c "CREATE USER twogether WITH PASSWORD 'twogether123';"
psql postgres -c "ALTER USER twogether CREATEDB;"

# 2. Create database
createdb -O twogether twogether_dev

# 3. Update .env.local
echo "DATABASE_URL=postgresql://twogether:twogether123@localhost:5432/twogether_dev" >> .env.local

# 4. Run migrations
NODE_ENV=development npm run migrate
```

### Database Management
```bash
# Connect to local database
psql postgresql://twogether:twogether123@localhost:5432/twogether_dev

# Run migrations
npm run migrate

# Check migration status
npm run migrate:status

# Reset database (drops all tables)
psql twogether_dev -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
NODE_ENV=development npm run migrate
```

## 📋 Development Commands

### Quick Reference
```bash
# Development
npm run build              # Build frontend for production
npm run dev               # Start frontend dev server with hot reload
npm run dev:backend       # Start backend API server
npm start                 # Start production server

# Testing
npm test                  # Run all tests (backend + E2E)
npm run test:backend      # Run backend tests only
npm run test:e2e          # Run E2E tests only
npm run test:e2e:ui       # Run E2E tests with UI

# Linting & Code Quality
npm run lint              # Lint TypeScript/JavaScript code
```

## 📁 Project Structure

```
twogether/
├── server.js              # Main Express server (serves API + frontend)
├── package.json           # Combined dependencies (frontend + backend)
├── app.yaml               # App Engine Standard config
├── vite.config.ts         # Vite frontend build configuration
├── index.html             # HTML entry point
├── src/                   # React source code
│   ├── App.tsx            # Main React component
│   ├── components/        # React components
│   └── services/          # API service layer
├── dist/                  # Built React app (auto-generated)
├── routes/                # Backend API routes (auth, couples, etc.)
├── database/              # PostgreSQL connection
├── middleware/            # Auth & validation middleware
├── tailwind.config.js     # Tailwind CSS configuration
├── tsconfig.json          # TypeScript configuration
└── cloudbuild.yaml        # Google Cloud Build configuration
```

## Environment Variables

### Required Variables
```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost/twogether

# JWT Authentication
JWT_SECRET=your-long-random-secret-key

# Supabase (required for storage features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# Server Configuration
NODE_ENV=production
PORT=8080
CORS_ORIGIN=http://localhost:5174

# Email (optional, for notifications)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Twogether <no-reply@example.com>
```

## 🔧 Supabase Setup

### 1. Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project
3. Note your Project URL and Service Role Key

### 2. Create Storage Bucket
1. Go to **Storage** in Supabase dashboard
2. Create a bucket named `photos`
3. Enable **Public bucket** for direct image access

### 3. Update Environment
Add your Supabase credentials to `.env`:
```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 🔒 Security Best Practices

### Environment Security
- ✅ **DO**: Use `.env` file for all secrets
- ✅ **DO**: Use different secrets for development and production
- ❌ **DON'T**: Commit `.env` file to version control
- ❌ **DON'T**: Share your `SUPABASE_SERVICE_ROLE_KEY`

### Password Security
- ✅ **DO**: Use long, random strings for `JWT_SECRET` (minimum 32 characters)
- ✅ **DO**: Use strong passwords for database
- ✅ **DO**: Rotate secrets regularly in production

## API Endpoints

All API routes are prefixed with `/api/`:

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Couples
- `GET /api/couples` - Get couple information
- `POST /api/couples` - Create or join couple (with pairing code)
- `POST /api/couples/generate-pairing-code` - Generate pairing code
- `PUT /api/couples/nicknames` - Update partner nicknames
- `PUT /api/couples/journey` - Update couple journey milestones

### Love Moments
- `GET /api/love-moments` - Get all records
- `POST /api/love-moments` - Create new record
- `GET /api/love-moments/{id}` - Get specific record
- `PUT /api/love-moments/{id}` - Update record
- `DELETE /api/love-moments/{id}` - Delete record

### Photos
- `POST /api/photos/upload` - Upload photo to Supabase
- `GET /api/photos` - Get photo listings

### Achievements & Coins
- `GET /api/achievements` - Get achievements
- `GET /api/coins/balance` - Get coin balance
- `POST /api/coins/transactions` - Coin transactions

### Statistics
- `GET /api/stats` - Get user statistics
- `GET /api/stats/leaderboard` - Get leaderboard

### Intimacy Requests
- `GET /api/intimacy-requests` - Get intimacy requests
- `POST /api/intimacy-requests` - Create intimacy request
- `PUT /api/intimacy-requests/:id/respond` - Respond to intimacy request
- `DELETE /api/intimacy-requests/:id` - Delete intimacy request

### Intimacy Templates & Options
- `GET /api/intimacy-requests/intimacy-templates` - Get all intimacy templates
- `GET /api/intimacy-requests/intimacy-templates/:category` - Get templates by category
- `GET /api/intimacy-requests/alternative-intimacy-options` - Get alternative intimacy options

### Notifications
- `GET /api/intimacy-requests/notifications` - Get user notifications
- `PUT /api/intimacy-requests/notifications/mark-read` - Mark notifications as read
- `GET /api/intimacy-requests/notifications/unread-count` - Get unread count
- `GET /api/intimacy/notifications/unread-count` - Alternative endpoint for frontend compatibility

## 🚀 Development Workflow

### Scripts Available
```bash
# Development
npm run dev              # Start backend API server
npm run dev:frontend     # Start frontend with hot reload

# Production
npm run build            # Build frontend to /public
npm run start            # Start production server

# Utilities
npm run install:all      # Install all dependencies
npm run test            # Run tests
```

## 🌐 Architecture Benefits

### Cost Optimization
- **Before**: App Engine Flex ~$50-100/month (always-on instances)
- **After**: App Engine Standard ~$0-5/month (scales to zero, free tier)

### Performance
- **Cold Start**: Node.js ~1-2s vs Rust ~5-10s
- **Memory**: Lower memory usage with combined instance
- **Network**: No inter-service calls (frontend ↔ backend)

### Development
- **Single Deploy**: One command deploys everything
- **Shared Dependencies**: No version mismatches
- **Simplified CORS**: No cross-origin issues in production

## 🐛 Troubleshooting

### Common Issues

#### 1. Environment Setup
```bash
# Check if .env file exists
ls -la .env

# Verify environment variables are set
cat .env | grep -E "(DATABASE_URL|JWT_SECRET|SUPABASE_URL)"

# Create .env from template if missing
cp .env.example .env
```

#### 2. Database Connection Issues
```bash
# Test database connection (requires psql)
psql $DATABASE_URL -c "SELECT NOW();"

# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:port/database
```

#### 3. Port Issues
```bash
# Check what's running on port 8080
lsof -i :8080

# Kill processes on port 8080
lsof -ti:8080 | xargs kill -9

# Or use a different port
PORT=8081 node server.js
```

#### 4. Frontend Build Issues
```bash
# Clean and rebuild frontend
rm -rf dist
npm run build

# Check build output
ls -la dist/
```

#### 5. Dependencies Issues
```bash
# Clean install all dependencies
rm -rf node_modules
npm install
```

#### 6. Deployment Issues
```bash
# Check Google Cloud auth
gcloud auth list

# Set project
gcloud config set project YOUR_PROJECT_ID

# Check App Engine status
gcloud app describe

# View deployment logs
gcloud app logs tail -s default
```

### Health Checks

#### Local Development
```bash
# Test backend health
curl http://localhost:8080/health

# Test API endpoint (if exists)
curl http://localhost:8080/api/auth/me

# Expected health response:
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "development",
  "version": "1.0.0"
}
```

#### Production
```bash
# Test production health (replace with your domain)
curl https://your-project.uc.r.appspot.com/health

# Check Google Cloud Console for logs and metrics
```

### Debug Mode
```bash
# Start backend with debug logging
DEBUG=* npm run dev:backend

# Or specific debug namespace
DEBUG=express:* npm run dev:backend

# Start frontend in development mode for debugging
npm run dev
```

## 🔍 Monitoring

- **Health Endpoint**: `/health` for uptime monitoring
- **App Engine Logs**: Centralized logging in Google Cloud Console
- **Error Tracking**: Automatic error logging
- **Performance**: Built-in App Engine metrics

## 🎛️ Scaling

The app is designed for small to medium couple user bases:

- **Free Tier**: ~1000 MAU with basic usage
- **Paid Tier**: Scales automatically based on traffic
- **Database**: PostgreSQL on Supabase (separate scaling)
- **Storage**: Supabase Storage (separate scaling)

## 📊 E2E Testing Checklist

To verify everything is working:

1. 註冊兩個帳號 → 登入 A
2. 透過 `配對碼` 或 email 完成配對 → 登入 B 確認
3. 在 A 端發送「親密邀請」→ B 端通知中心可看到
4. B 端輸入自訂回覆並「接受」→ A 端收到通知、可見回覆文字

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use TypeScript for all code; prefer interfaces over types
- Use functional and declarative programming patterns
- Write concise, technical code with accurate examples
- Use descriptive variable names with auxiliary verbs (e.g., isLoading, hasError)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@twogether.app or create an issue in this repository.