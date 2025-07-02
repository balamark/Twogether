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
fi

# Start PostgreSQL with Docker Compose
echo "🐘 Starting PostgreSQL database..."
docker-compose up -d postgres

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if PostgreSQL is ready
while ! docker-compose exec postgres pg_isready -U twogether; do
    echo "⏳ Still waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready!"

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
echo "To start the development servers:"
echo "  1. Backend: cd backend && cargo run"
echo "  2. Frontend: cd frontend && npm run dev"
echo "  3. Database Admin: http://localhost:8081 (adminer)"
echo ""
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: twogether_dev"
echo "  Username: twogether"
echo "  Password: twogether_dev_password" 