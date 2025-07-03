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
- Docker (for deployment)

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/balamark/Twogether.git
   cd Twogether
   ```

2. **Backend Setup**
   ```bash
   cd backend
   cargo install sqlx-cli
   cargo run
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Database Setup**
   ```bash
   # Run migrations
   sqlx migrate run
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
- `SUPABASE_SERVICE_KEY`: Supabase service role key

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
DATABASE_URL=postgresql://user:password@localhost/twogether
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
JWT_SECRET=your-jwt-secret
```

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8080
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

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
