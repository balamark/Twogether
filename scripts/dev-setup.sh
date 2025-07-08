#!/bin/bash

# Twogether Development Setup Script
# This script sets up the local development environment

set -e

echo "🚀 Setting up Twogether development environment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📄 Creating .env file..."
    cp env.example .env
    echo "✅ .env file created. Please edit it with your configuration."
    echo "❗ IMPORTANT: Update your Supabase credentials in .env before proceeding!"
    echo "   You can run this script again after updating .env"
    exit 0
fi

# Load environment variables from .env (only valid assignments, skip comments)
echo "📋 Loading environment variables from .env..."
while IFS= read -r line; do
    # Skip empty lines and comments
    if [[ -n "$line" && ! "$line" =~ ^[[:space:]]*# ]]; then
        # Only export lines that contain = (valid variable assignments)
        if [[ "$line" =~ = ]]; then
            export "$line"
        fi
    fi
done < .env

# Create uploads directory
echo "📁 Creating uploads directory..."
mkdir -p uploads
chmod 755 uploads

# Start PostgreSQL with Docker Compose
echo "🐘 Starting PostgreSQL database..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if PostgreSQL is ready
while ! docker-compose exec -T postgres pg_isready -U twogether; do
    echo "⏳ Still waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

# Install SQLx CLI if not installed
if ! command -v sqlx &> /dev/null; then
    echo "🔧 Installing SQLx CLI..."
    cargo install sqlx-cli --no-default-features --features native-tls,postgres
fi

# Run database migrations
echo "🗄️  Running database migrations..."
cd backend
DATABASE_URL="$DATABASE_URL" sqlx migrate run
cd ..

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Build backend
echo "🦀 Building backend..."
cd backend
cargo build
cd ..

echo "🎉 Development environment setup complete!"
echo ""
echo "🚀 To start the development servers:"
echo ""
echo "  Option 1 - Use start-dev.sh (recommended):"
echo "    ./start-dev.sh"
echo ""
echo "  Option 2 - Manual startup:"
echo "    Terminal 1 - Backend:"
echo "      cd backend"
echo "      DATABASE_URL=\"$DATABASE_URL\" cargo run"
echo ""
echo "    Terminal 2 - Frontend:"
echo "      cd frontend"
echo "      npm run dev"
echo ""
echo "📊 Access points:"
echo "  • Frontend:     http://localhost:5174"
echo "  • Backend API:  http://localhost:8080"
echo ""
echo "🗄️  Database connection details (loaded from .env):"
echo "  • Database URL: $DATABASE_URL"
echo ""
echo "📋 View logs:"
echo "  • Backend logs: Check terminal where 'cargo run' is running"
echo "  • Frontend logs: Check terminal where 'npm run dev' is running"
echo "  • Database logs: docker-compose logs postgres"
echo "  • All container logs: docker-compose logs -f"
echo ""
echo "🛠️  Useful commands:"
echo "  • Stop database: docker-compose down"
echo "  • Reset database: docker-compose down -v && docker-compose up -d postgres"
echo "  • View database: docker-compose exec postgres psql -U twogether -d twogether_dev"
echo ""
echo "📁 File locations:"
echo "  • Uploaded photos: ./uploads/"
echo "  • Database data: Docker volume 'twogether_postgres_data'"
echo "  • Configuration: .env file" 