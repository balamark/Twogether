# Twogether - 情侶親密追蹤應用

A comprehensive web application designed to help couples maintain and enhance their intimate connection through gamification, tracking, and relationship wellness tools. Built with modern web technologies and designed for both web and future iOS deployment.

## 🏗️ Architecture Status

✅ **Core Foundation Complete**
- React + TypeScript frontend with Tailwind CSS
- Rust backend with Axum framework
- PostgreSQL database with migrations
- Component-based architecture with proper separation
- Responsive design optimized for mobile and desktop

## ✨ Features Overview

### 🗓️ Core Features
1. **愛的日曆 (Love Calendar)** - Track intimate moments with privacy
2. **親密統計 (Intimacy Statistics)** - Visual stats and frequency tracking  
3. **情趣遊戲 (Romance Games)** - 6+ interactive activities to enhance connection
4. **和諧相處 (Conflict Resolution)** - 5 proven techniques for relationship harmony
5. **角色扮演劇本 (Role-play Scripts)** - 15-minute customized scenarios
6. **成就系統 (Achievement System)** - Duolingo-style badges and progression
7. **金幣系統 (Coin System)** - Earn coins to unlock content and exchange gifts
8. **回憶相簿 (Memory Book)** - Photo uploads and timeline memories

### 🛡️ Privacy & Security
- Nickname-only identification (no real names)
- Local data storage with optional cloud backup
- Secure authentication for couples
- Private sharing between partners only

## 🏗️ Technical Architecture

### Backend (Rust)
- **Framework**: Axum with Tower middleware
- **Database**: PostgreSQL (Docker for local, Supabase for production)
- **Authentication**: JWT tokens with session management
- **File Storage**: Local filesystem + Google Cloud Storage for production
- **API**: RESTful endpoints with JSON responses
- **Deployment**: Google Cloud Platform with automated CI/CD

### Frontend (Web)
- **Framework**: React with TypeScript (Vite dev server on port 5174)
- **Styling**: Tailwind CSS with custom romantic themes
- **State Management**: Zustand for simple state
- **UI Components**: Headless UI with custom romantic designs
- **Charts**: Chart.js for statistics visualization
- **Language**: Traditional Chinese interface

### Infrastructure
- **Local Development**: Docker Compose for PostgreSQL
- **Production Database**: Supabase PostgreSQL
- **Deployment**: Google Cloud Platform
- **CI/CD**: GitHub Actions for automated deployment
- **Monitoring**: Google Cloud Monitoring

### Mobile Strategy
- **Phase 1**: Progressive Web App (PWA) with responsive design
- **Phase 2**: React Native iOS app (future release)
- **Current**: Optimized for mobile web browsers

## 📋 Development Phases

### Phase 1: Foundation (Week 1-2)
**Backend Setup**
- [x] Project structure with Cargo workspace
- [ ] Basic Axum server with CORS
- [ ] Database schema design and migrations
- [ ] User authentication system
- [ ] Basic API endpoints for users and couples

**Frontend Setup**
- [ ] React + TypeScript + Vite setup
- [ ] Tailwind CSS configuration with romantic color palette
- [ ] Basic routing structure
- [ ] Authentication flow (login/register)
- [ ] Responsive layout components

### Phase 2: Core Calendar & Statistics (Week 3-4)
**Calendar System**
- [ ] Date/time picker for intimate moments
- [ ] Calendar view with love indicators
- [ ] Quick recording with one-click interface
- [ ] Edit/delete recorded moments

**Statistics Dashboard**
- [ ] Weekly/monthly frequency charts
- [ ] Streak tracking visualization
- [ ] Beautiful data visualization with warm colors
- [ ] Export functionality for personal records

### Phase 3: Gamification (Week 5-6)
**Achievement System**
- [ ] Badge definitions and logic
  - 週間戀人 (Weekly Lovers) - 1x/week
  - 熱戀情侶 (Passionate Couple) - 2x/week  
  - 甜蜜無敵 (Sweet Invincible) - 3x+/week
  - Milestone badges (1 month, 3 months, 1 year streaks)
- [ ] Progress tracking and notifications
- [ ] Achievement celebration animations

**Coin System**
- [ ] Coin earning mechanics
- [ ] Coin balance tracking
- [ ] Unlock system for premium content
- [ ] Gift exchange marketplace

### Phase 4: Interactive Content (Week 7-8)
**Romance Games**
- [ ] Truth or Dare for couples
- [ ] Massage techniques guide
- [ ] Communication exercises
- [ ] Intimacy challenges
- [ ] Date night idea generator
- [ ] Love language activities

**Role-play Scripts**
- [ ] Script templates with nickname substitution
- [ ] 3+ scenario categories:
  - 初次相遇 (First Meeting)
  - 辦公室戀情 (Office Romance)
  - 甜蜜約會 (Sweet Date)
- [ ] 15-minute conversation flows
- [ ] Adult-oriented content with tasteful presentation

### Phase 5: Relationship Tools (Week 9-10)
**Conflict Resolution**
- [ ] 5 proven communication techniques
- [ ] Guided resolution workflows
- [ ] Emotion check-ins
- [ ] Reconciliation activities
- [ ] Stress reduction exercises

**Memory Book**
- [ ] Photo upload and storage
- [ ] Timeline view of memories
- [ ] Caption and tagging system
- [ ] Anniversary reminders
- [ ] Memory sharing between partners

### Phase 6: Polish & Launch (Week 11-12)
**UI/UX Enhancement**
- [ ] Romantic gradient themes
- [ ] Smooth animations and transitions
- [ ] Accessibility improvements
- [ ] Performance optimization

**Testing & Deployment**
- [ ] Production deployment setup
- [ ] Analytics and monitoring

## 🚀 Quick Start

### Local Development

1. **Clone and Setup**
   ```bash
   git clone <your-repo>
   cd Twogether
   chmod +x scripts/dev-setup.sh
   ./scripts/dev-setup.sh
   ```

2. **Start Development Servers**
   ```bash
   # Terminal 1: Backend
   cd backend && cargo run
   
   # Terminal 2: Frontend  
   cd frontend && npm run dev
   ```

3. **Access Application**
   - Frontend: http://localhost:5174
   - Backend API: http://localhost:8080
   - Database Admin: http://localhost:8081

### Production Deployment

1. **Setup Google Cloud**
   ```bash
   # Install Google Cloud SDK
   # Set up your project and enable APIs
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Configure Secrets**
   Set these in your GitHub repository secrets:
   - `GCP_PROJECT_ID`: Your Google Cloud project ID
   - `GCP_SA_KEY`: Service account JSON key
   - `DATABASE_URL`: Supabase PostgreSQL connection string
   - `JWT_SECRET`: Strong random secret for JWT signing
   - `CORS_ORIGIN`: Your frontend domain
   - `GCS_BUCKET_NAME`: Google Cloud Storage bucket for frontend

3. **Deploy via GitHub Actions**
   ```bash
   git push origin main  # Triggers automatic deployment
   ```

   Or deploy manually:
   ```bash
   chmod +x scripts/deploy.sh
   ./scripts/deploy.sh
   ```

## 🎨 Design System

### Color Palette
```
Primary: Warm pink gradients (#FF6B9D to #FF8CC8)
Secondary: Soft coral (#FF7A7A to #FFA07A)  
Accent: Gold highlights (#FFD700)
Background: Cream whites (#FFF8F5)
Text: Warm grays (#4A4A4A)
```

### Typography
- Headers: Elegant serif fonts for romantic feel
- Body: Clean sans-serif for readability
- Language: Traditional Chinese optimized

### UI Elements
- Heart symbols for love tracking
- Achievement badges with elegant designs
- Soft, rounded components
- Romantic animations and transitions

## 💾 Database Schema

### Users Table
```sql
- id: UUID (Primary Key)
- nickname: VARCHAR(50)
- email: VARCHAR(100) (encrypted)
- password_hash: VARCHAR(255)
- created_at: TIMESTAMP
- last_login: TIMESTAMP
```

### Couples Table
```sql
- id: UUID (Primary Key)
- user1_id: UUID (Foreign Key)
- user2_id: UUID (Foreign Key)  
- couple_name: VARCHAR(100)
- anniversary_date: DATE
- created_at: TIMESTAMP
```

### Love_Moments Table
```sql
- id: UUID (Primary Key)
- couple_id: UUID (Foreign Key)
- recorded_by: UUID (Foreign Key)
- moment_date: TIMESTAMP
- notes: TEXT (optional)
- created_at: TIMESTAMP
```

### Achievements Table
```sql
- id: UUID (Primary Key)
- couple_id: UUID (Foreign Key)
- badge_type: VARCHAR(50)
- earned_date: TIMESTAMP
- milestone_value: INTEGER
```

### Coins Table
```sql
- id: UUID (Primary Key)
- couple_id: UUID (Foreign Key)
- balance: INTEGER
- earned_from: VARCHAR(100)
- spent_on: VARCHAR(100)
- transaction_date: TIMESTAMP
```

### Photos Table
```sql
- id: UUID (Primary Key)
- couple_id: UUID (Foreign Key)
- file_path: VARCHAR(255)
- caption: TEXT
- upload_date: TIMESTAMP
- memory_date: DATE
```

## 🚀 Getting Started

### Prerequisites
- Rust 1.70+ with Cargo
- Node.js 18+ with npm/yarn
- Docker & Docker Compose (for PostgreSQL)
- SQLite3 (fallback) / PostgreSQL (recommended)

### Quick Setup
```bash
# Clone repository
git clone [repository-url]
cd Twogether

# Run automated setup
chmod +x scripts/dev-setup.sh
./scripts/dev-setup.sh
```

## 🛠️ Development Guide

### Starting Development Servers

#### Method 1: Separate Terminals (Recommended)
```bash
# Terminal 1: Start database
docker-compose up -d postgres

# Terminal 2: Backend server
cd backend
cargo run

# Terminal 3: Frontend server
cd frontend
npm run dev
```

#### Method 2: Background Processes
```bash
# Start all services in background
docker-compose up -d postgres
cd backend && cargo run &
cd frontend && npm run dev &
```

### 🔍 Process Management & Troubleshooting

#### Check Running Processes
```bash
# Check npm processes
ps aux | grep "npm run dev" | grep -v grep

# Check Vite processes  
ps aux | grep "vite" | grep -v grep

# Check port usage
lsof -i :5174  # Frontend
lsof -i :8080  # Backend
lsof -i :5432  # PostgreSQL
```

#### Clean Restart Development Servers
```bash
# Kill all development processes
pkill -f "npm run dev"
pkill -f "vite" 
pkill -f "cargo run"

# Or use our restart script
chmod +x scripts/restart-dev.sh
./scripts/restart-dev.sh
```

#### View Development Logs
```bash
# Frontend logs (if running in background)
tail -f frontend/dev.log

# Backend logs
cd backend && RUST_LOG=debug cargo run

# Database logs
docker-compose logs -f postgres

# All logs combined
docker-compose logs -f
```

### 📱 Access URLs
- **Frontend**: http://localhost:5174
- **Backend API**: http://localhost:8080
- **Database Admin**: http://localhost:8081 (pgAdmin)
- **API Health**: http://localhost:8080/health

### 🗄️ Database Management

#### Using Docker PostgreSQL (Recommended)
```bash
# Start PostgreSQL
docker-compose up -d postgres

# Connect to database
docker-compose exec postgres psql -U twogether -d twogether_db

# Run migrations
cd backend
sqlx migrate run

# Reset database
sqlx migrate revert
sqlx migrate run
```

#### Using SQLite (Fallback)
```bash
# Set environment variable
export DATABASE_URL=sqlite:./love_time.db

# Run migrations
cd backend
sqlx migrate run
```

### Environment Variables
Create `.env` file from `env.example`:
```env
# Database Configuration
DATABASE_URL=postgres://twogether:lovepassword@localhost:5432/twogether_db
# Or for SQLite: DATABASE_URL=sqlite:./love_time.db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
CORS_ORIGIN=http://localhost:5174
UPLOAD_PATH=./uploads

# Optional: File Storage
GCS_BUCKET_NAME=your-gcs-bucket
```

### 🚨 Common Issues & Solutions

#### Multiple npm processes running
```bash
# Problem: Multiple "npm run dev" processes
# Solution: Kill all and restart
pkill -f "npm run dev" && pkill -f "vite"
cd frontend && npm run dev
```

#### Port already in use
```bash
# Problem: Port 5174 or 8080 already in use
# Solution: Kill process using port
lsof -ti:5174 | xargs kill -9
lsof -ti:8080 | xargs kill -9
```

#### Database connection issues
```bash
# Problem: Can't connect to PostgreSQL
# Solution: Restart Docker container
docker-compose down
docker-compose up -d postgres
# Wait 10 seconds for startup
cd backend && cargo run
```

#### Build/compilation errors
```bash
# Problem: Frontend build errors
cd frontend
rm -rf node_modules package-lock.json
npm install

# Problem: Rust compilation errors  
cd backend
cargo clean
cargo build
```

## 📱 Coin Economy System

### Earning Coins
- Record intimate moment: +100 coins
- Try new role-play script: +300 coins
- Complete weekly challenge: +500 coins
- Achieve new badge: +1000 coins
- Upload memory photo: +50 coins
- Resolve conflict activity: +200 coins

### Spending Coins
- Unlock premium scripts: 1000 coins
- New positions guide: 3000 coins
- Advanced games: 2000 coins
- Custom gift templates: 500 coins
- Extended statistics: 1500 coins

### Gift Exchange
- Couples can set custom rewards:
  - Home-cooked meal: 2000 coins
  - Massage session: 1500 coins  
  - Date night planning: 3000 coins
  - Small surprise gift: 5000 coins
  - Custom service/favor: Variable pricing

## 🏆 Achievement System

### Frequency Badges
- **新手情侶** (Beginner Couple): First recorded moment
- **週間戀人** (Weekly Lovers): 1 time per week for 4 weeks
- **熱戀情侶** (Passionate Couple): 2 times per week for 4 weeks
- **甜蜜無敵** (Sweet Invincible): 3+ times per week for 4 weeks

### Milestone Badges  
- **蜜月期** (Honeymoon Phase): 30 consecutive days
- **穩定戀人** (Stable Lovers): 100 total moments
- **永遠甜蜜** (Forever Sweet): 365 days of usage
- **真愛無敵** (True Love Invincible): 1000 total moments

### Special Achievements
- **冒險家** (Adventurers): Try all role-play scenarios
- **和諧大師** (Harmony Master): Complete all conflict resolution exercises
- **回憶收藏家** (Memory Collector): Upload 50+ photos
- **遊戲專家** (Game Expert): Play all romance games

## 🔐 Privacy & Security Considerations

### Data Protection
- All personal data encrypted at rest
- Minimal data collection (nicknames only)
- Optional cloud backup with encryption
- Regular data export functionality
- Right to deletion compliance

### Content Guidelines
- Age verification required (18+)
- Tasteful presentation of adult content
- No explicit imagery in UI
- Focus on relationship wellness
- Cultural sensitivity for Chinese market

## 📖 Content Strategy

### Role-play Scripts
**初次相遇 (First Meeting)**
- Coffee shop encounter
- Library study session  
- Gym workout meeting
- Travel adventure beginning

**辦公室戀情 (Office Romance)**
- Late night work sessions
- Business trip scenarios
- Conference room encounters
- Elevator conversations

**甜蜜約會 (Sweet Dating)**
- Romantic dinner dates
- Weekend getaway planning
- Anniversary celebrations
- Surprise date preparations

#### 🖼️ Updating Roleplay Script Images
To update the images for roleplay scripts, place your images in the following directory structure:

```
frontend/public/images/roleplay/
├── first-meeting.jpg          # 初次相遇
├── office-romance.jpg         # 辦公室秘密
├── forbidden-temptation.jpg   # 禁忌誘惑
├── reunion-love.jpg           # 舊情復燃
└── vacation-romance.jpg       # 度假誘惑
```

**Image Requirements:**
- Format: JPG, PNG, or WebP
- Recommended size: 400x300px (4:3 aspect ratio)
- File size: Under 500KB for optimal loading
- Content: Tasteful, romantic imagery that represents the script theme
- Naming: Use the exact filenames listed above

**Adding New Scripts:**
1. Add the script object to the `roleplayScripts` array in `frontend/src/App.tsx`
2. Include the `category` field ('romantic' or 'adventurous')
3. Add the `image` field with the path to your image
4. Place the corresponding image file in the `frontend/public/images/roleplay/` directory

### Romance Games
1. **真心話大冒險** (Truth or Dare for Couples)
2. **按摩時光** (Massage Time Guide)
3. **愛的問答** (Love Q&A Game)
4. **約會計劃師** (Date Planner Challenge)
5. **情話創作** (Love Poetry Creation)
6. **回憶重溫** (Memory Lane Game)

## 🌟 Future Enhancements

### Version 2.0 Features
- [ ] Video call integration for long-distance couples
- [ ] AI-powered relationship advice
- [ ] Couple personality compatibility analysis
- [ ] Integration with fitness trackers
- [ ] Smart notifications and reminders
- [ ] Couple challenges with friends (private groups)
- [ ] Advanced analytics and insights
- [ ] Multi-language support (Simplified Chinese, English)

### Technical Improvements
- [ ] Real-time synchronization between devices
- [ ] End-to-end encryption for all data
- [ ] Advanced caching strategies
- [ ] Performance monitoring and optimization
- [ ] A/B testing framework for UI improvements

---

## 💝 Mission Statement

"愛的時光" aims to help couples maintain and deepen their intimate connection in our busy modern world. Through thoughtful gamification, privacy-focused design, and relationship wellness tools, we provide a safe space for couples to prioritize their love and create lasting memories together.

**Together, let's make time for love. 一起創造愛的時光。** 