# Twogether - 情侶親密時光記錄 App

A modern couples app for recording intimate moments, achievements, and relationship milestones. Built with React/TypeScript frontend and Rust/Axum backend.

## Features

- **親密記錄**: Log intimate moments with mood, duration, location, and photos
- **成就系統**: Earn badges for milestones and achievements
- **角色扮演**: Custom roleplay scripts and scenarios
- **金幣商店**: Virtual currency system for rewards
- **配對系統**: Secure partner pairing with codes
- **統計分析**: Weekly/monthly intimacy statistics
- **隱私保護**: Secure authentication and data storage

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite for build tooling
- Tailwind CSS for styling
- TanStack Query for data fetching
- Lucide React for icons

### Backend
- Rust with Axum framework
- PostgreSQL database
- Supabase for storage and auth
- JWT authentication
- Docker containerization

## Quick Start

### Prerequisites
- Node.js 18+
- Rust 1.70+
- PostgreSQL
- SQLx CLI (`cargo install sqlx-cli`)
- Docker (optional for deployment)

### End-to-End Local Run (Plain Commands)

1) Environment
```bash
# From repo root
cp env.example .env
# Edit .env with your DATABASE_URL, SUPABASE_*, and email settings (optional)
```

2) Database migrations
```bash
cd backend
# Ensure DATABASE_URL is set; either export or rely on .env
export DATABASE_URL='postgresql://user:password@localhost:5432/twogether'   # if not set in .env
sqlx migrate run
```

3) SQLx offline metadata (required when queries change)
```bash
# With DATABASE_URL set, generate/refresh .sqlx metadata for offline compile-time checks
cargo sqlx prepare
```

4) Start backend (Terminal 1)
```bash
cd backend
cargo run
# Backend API: http://localhost:8080
```

5) Start frontend (Terminal 2)
```bash
cd frontend
npm install
npm run dev
# Frontend: http://localhost:5174
```

6) Health check
```bash
curl http://localhost:8080/health
```

### Manual Setup (Alternative)

1. **Clone and Setup Environment**
```bash
git clone https://github.com/balamark/Twogether.git
cd Twogether
cp env.example .env
```

2. **Database Setup**
```bash
cargo install sqlx-cli
cd backend
sqlx migrate run
cargo sqlx prepare
cd ..
```

3. **Backend Server (Rust/Axum)**
```bash
cd backend
cargo run
```

4. **Frontend Server (React/Vite)**
```bash
cd frontend
npm install
npm run dev
```

### E2E Smoke Test Checklist
- 註冊兩個帳號 → 登入 A
- 透過 `配對碼` 或 email 完成配對 → 登入 B 確認
- 在 A 端發送「親密邀請」→ B 端通知中心可看到
- B 端輸入自訂回覆並「接受」→ A 端收到通知、可見回覆文字

## Docker Compose (Optional)

A simple `docker-compose.yml` is provided to run backend and the Vite dev server in containers.

```bash
# From repo root
export DATABASE_URL='postgresql://user:password@host:5432/db'
export SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=...
export VITE_API_BASE_URL='http://localhost:8080/api'
export CORS_ORIGIN='http://localhost:5174'
docker compose up --build
```

- Backend: `http://localhost:8080`
- Frontend: `http://localhost:5174`

Notes:
- Backend Dockerfile uses SQLx offline mode (`SQLX_OFFLINE=true`). If you change queries, re-run `cargo sqlx prepare` locally and commit the updated `.sqlx` directory so compose builds keep working.
- Ensure volumes and ports in compose suit your environment.

## Dev Scripts (Optional)

- `./start-dev.sh`
  - Loads `.env`, runs migrations, and starts backend.
  - Flags: `--log-file [path]` to enable file logging via backend CLI.

- `./scripts/dev-start.sh`
  - Starts backend and/or frontend.
  - Usage:
    ```bash
    ./scripts/dev-start.sh backend   # start backend only
    ./scripts/dev-start.sh frontend  # start frontend only
    ./scripts/dev-start.sh           # start both (runs concurrently)
    ```

These scripts are optional sugar; plain commands above are sufficient.

## CORS Configuration

- Backend reads `CORS_ORIGIN` from environment (defaults to `http://localhost:5174`).
- We do not load a separate `.env.cors` file; put your CORS settings in `.env` (or export in your shell) under `CORS_ORIGIN`.
- Common local error (5173 vs 5174): if your frontend runs on 5174 but backend allows 5173, update backend env and restart:
```bash
# In repo root or before starting backend
export CORS_ORIGIN=http://localhost:5174
cd backend && cargo run
```
- For Docker Compose:
```bash
export CORS_ORIGIN=http://localhost:5174
docker compose up --build
```

## Deployment

### Google Cloud Platform (GCP)

This project includes GitHub Actions workflows for automated deployment to GCP.

#### Prerequisites
1. Google Cloud Project
2. Service Account with necessary permissions
3. Cloud Storage bucket for frontend
4. Cloud Run for backend

#### Required Secrets
Add these secrets to your GitHub repository:

- `GCP_PROJECT_ID`: Your Google Cloud Project ID
- `GCP_SA_KEY`: Service Account JSON key
- `GCP_FRONTEND_BUCKET`: Cloud Storage bucket name for frontend
- `DATABASE_URL`: PostgreSQL connection string
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key

#### Deployment Steps
1. Push to `main` branch triggers automatic deployment
2. Frontend deploys to Cloud Storage
3. Backend deploys to Cloud Run
4. Database migrations run automatically

### Manual Deployment

#### Frontend (Cloud Storage)
```bash
# Build frontend
cd frontend
npm run build

# Deploy to GCS
gsutil -m rsync -d -r dist gs://your-bucket-name
gsutil iam ch allUsers:objectViewer gs://your-bucket-name
gsutil web set -m index.html -e 404.html gs://your-bucket-name
```

#### Backend (Cloud Run)
```bash
# Build and push Docker image
docker build -t gcr.io/your-project/twogether-backend:latest ./backend
docker push gcr.io/your-project/twogether-backend:latest

# Deploy to Cloud Run
gcloud run deploy twogether-backend \
  --image gcr.io/your-project/twogether-backend:latest \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080
```

## Environment Variables

### Backend (.env)
```env
# Database (required)
DATABASE_URL=postgresql://user:password@localhost/twogether

# Supabase (required for storage features)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key

# JWT
JWT_SECRET=your-jwt-secret

# CORS / Server
CORS_ORIGIN=http://localhost:5174
PORT=8080

# Email (optional, for request/response notifications)
RESEND_API_KEY=your-resend-api-key
EMAIL_FROM=Twogether <no-reply@example.com>

# SMTP (optional alternative to Resend)
# Use your mailbox via SMTP (e.g., Gmail with App Password)
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=your.email@gmail.com
# SMTP_PASS=your-app-password
```

### Frontend (Vite)
```env
# Defaults to http://localhost:8080/api if not set
VITE_API_BASE_URL=http://localhost:8080/api
```

## SQLx Offline Mode (Rust)
- 本專案啟用 SQLx 編譯期驗證（`sqlx-macros`）並使用離線模式（`.sqlx` 目錄）。
- 當你「新增/修改」查詢或資料庫結構後，請執行：
```bash
cd backend
export DATABASE_URL='postgresql://user:password@localhost:5432/twogether'  # 若 .env 未提供
cargo sqlx prepare
```
- `cargo build` 之後即會使用離線元資料進行型別與語法驗證，無需連線資料庫。

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout

### Couples
- `GET /api/couples/pairing-code` - Get pairing code
- `POST /api/couples/connect` - Connect with partner

### Intimate Records
- `GET /api/love-moments` - Get all records
- `POST /api/love-moments` - Create new record
- `GET /api/love-moments/{id}` - Get specific record
- `PUT /api/love-moments/{id}` - Update record
- `DELETE /api/love-moments/{id}` - Delete record

### Statistics
- `GET /api/stats` - Get user statistics
- `GET /api/achievements` - Get achievements


Rust backend dev cycle for this repo
Start both services
Backend: cd backend && cargo run (or ./scripts/dev-start.sh backend)
Frontend: cd frontend && npm run dev (or ./scripts/dev-start.sh frontend)

When you change backend Rust code
Yes, the binary must rebuild. If you are running cargo run, it auto-rebuilds on restart. Use a watcher to rebuild on file change so you don’t have to restart manually:

Install cargo-watch: cargo install cargo-watch

Run: cd backend && DATABASE_URL=... cargo watch -x 'run'
This re-compiles and restarts the server whenever you edit files.

When you change SQL (queries or schema) with SQLx
Run migrations if schema changed:
cd backend && sqlx migrate run

Regenerate SQLx offline metadata so compile-time checks pass:
cd backend && cargo sqlx prepare

Then build/run: cargo run (or your cargo watch session will recompile automatically).

Note: this repo uses SQLx offline mode; remember to commit the updated .sqlx directory after changing queries.

Environment
Copy .env: cp env.example .env and fill values.
Backend reads env at startup; if you change env vars, restart the backend process.

Common local vars:
DATABASE_URL (required)
CORS_ORIGIN=http://localhost:5174
Supabase keys if you use storage.
Typical workflow
1) Terminal A: cd backend && cargo watch -x 'run'
2) Terminal B: cd frontend && npm run dev
3) If you edit queries or run new migrations:
cd backend && sqlx migrate run && cargo sqlx prepare
cargo-watch will rebuild and restart the server.

Quick script in repo
./scripts/dev-start.sh both starts backend and frontend (no watch). Use the cargo-watch approach above for true live-reload on backend code.


## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, email support@twogether.app or create an issue in this repository.# Test CI
