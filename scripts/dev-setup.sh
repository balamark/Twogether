#!/bin/bash

# Twogether Development Setup Script
# This script sets up the local development environment

set -e

echo "🚀 Setting up Twogether development environment..."

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

# Check if required environment variables are set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL is not set in .env file"
    echo "   Please set it to your Supabase PostgreSQL connection string"
    exit 1
fi

if [ -z "$SUPABASE_URL" ]; then
    echo "❌ SUPABASE_URL is not set in .env file"
    echo "   Please set it to your Supabase project URL"
    exit 1
fi

# Create uploads directory
echo "📁 Creating uploads directory..."
mkdir -p uploads
chmod 755 uploads

# Install SQLx CLI if not installed
if ! command -v sqlx &> /dev/null; then
    echo "🔧 Installing SQLx CLI..."
    cargo install sqlx-cli --no-default-features --features postgres
fi

# Test database connection
echo "🔍 Testing database connection..."
cd backend
if ! DATABASE_URL="$DATABASE_URL" sqlx migrate info; then
    echo "❌ Failed to connect to database. Please check your DATABASE_URL."
    echo "   Make sure your Supabase database is accessible."
    exit 1
fi

# Run database migrations
echo "🗄️  Running database migrations..."
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
echo "  • Supabase URL: $SUPABASE_URL"
echo ""
echo "📋 View logs:"
echo "  • Backend logs: Check terminal where 'cargo run' is running"
echo "  • Frontend logs: Check terminal where 'npm run dev' is running"
echo ""
echo "🛠️  Useful commands:"
echo "  • Test database: cd backend && DATABASE_URL=\"$DATABASE_URL\" sqlx migrate info"
echo "  • Run migrations: cd backend && DATABASE_URL=\"$DATABASE_URL\" sqlx migrate run"
echo "  • Generate SQLx data: cd backend && DATABASE_URL=\"$DATABASE_URL\" cargo sqlx prepare"
echo ""
echo "📁 File locations:"
echo "  • Uploaded photos: ./uploads/"
echo "  • Configuration: .env file"
echo "  • Database: Supabase PostgreSQL (managed)" 