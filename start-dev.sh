#!/bin/bash

# Development startup script for Twogether
# This script starts the database in Docker and runs the applications locally

echo "🚀 Starting Twogether Development Environment..."

# Start PostgreSQL in Docker
echo "📊 Starting PostgreSQL database..."
docker compose up postgres -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for database to be ready..."
sleep 5

# Run database migrations
echo "🗄️ Running database migrations..."
cd backend
DATABASE_URL="postgresql://twogether:twogether_dev_password@localhost:5432/twogether_dev" sqlx migrate run --source migrations
cd ..

# Set environment variables for development
export DATABASE_URL="postgresql://twogether:twogether_dev_password@localhost:5432/twogether_dev"
export JWT_SECRET="twogether-dev-secret-key-change-in-production"
export CORS_ORIGIN="http://localhost:5174"
export PORT="8080"
export ENVIRONMENT="development"

# Note: Replace these with your actual Supabase credentials
export SUPABASE_URL="https://gqhoebnveeaishflmkqv.supabase.co"
export SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaG9lYm52ZWVhaXNoZmxta3F2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE0Mjg5NTcsImV4cCI6MjA2NzAwNDk1N30.kw7lXqkbXiD9lKX6bSUxq_zWIPBDUB-xZ1PAy-AUG-E"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxaG9lYm52ZWVhaXNoZmxta3F2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTQyODk1NywiZXhwIjoyMDY3MDA0OTU3fQ.MVaYbfHe_wI2xMpmMnEuugM5MM37sgM8LU9diltU2q0"

echo "🔧 Environment variables set."

# Create logs directory
mkdir -p logs

# Start backend in background with logging
echo "🦀 Starting Rust backend..."
cd backend

# Source Cargo environment if it exists
if [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
fi

# Check if cargo is available
if ! command -v cargo &> /dev/null; then
    echo "❌ Cargo not found. Please install Rust and Cargo first:"
    echo "   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    echo "   source ~/.cargo/env"
    echo "   Then run this script again."
    exit 1
fi

RUST_LOG=debug SQLX_OFFLINE=true cargo run --release > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend with logging
echo "⚛️ Starting React frontend..."
cd frontend
npm run dev > ../logs/frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "✅ Development environment started!"
echo "🌐 Frontend: http://localhost:5174"
echo "🔗 Backend API: http://localhost:8080"
echo "📝 Backend logs: tail -f logs/backend.log"
echo "📝 Frontend logs: tail -f logs/frontend.log"
echo ""
echo "Press Ctrl+C to stop all services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    docker compose down
    echo "👋 Goodbye!"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Wait for user to stop
wait 