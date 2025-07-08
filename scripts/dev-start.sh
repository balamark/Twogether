#!/bin/bash

# Twogether Development Start Script
# This script starts both frontend and backend development servers

set -e

echo "🚀 Starting Twogether development servers..."

# Check if .env file exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found. Creating from env.example..."
    cp env.example .env
    echo "❗ Please edit .env with your actual configuration before continuing."
    exit 1
fi

# Load environment variables from .env
export $(grep -v '^#' .env | xargs)

# Check if PostgreSQL is running
if ! docker ps | grep -q twogether-postgres; then
    echo "🐘 Starting PostgreSQL database..."
    docker-compose up -d postgres
    
    # Wait for PostgreSQL to be ready
    echo "⏳ Waiting for PostgreSQL to be ready..."
    sleep 5
    while ! docker-compose exec -T postgres pg_isready -U twogether; do
        echo "⏳ Still waiting for PostgreSQL..."
        sleep 2
    done
    echo "✅ PostgreSQL is ready!"
fi

# Function to start backend
start_backend() {
    echo "🦀 Starting Rust backend..."
    cd backend
    DATABASE_URL="$DATABASE_URL" cargo run
}

# Function to start frontend  
start_frontend() {
    echo "⚛️  Starting React frontend..."
    cd frontend
    npm run dev
}

# Check if we should run both or just one
case "${1:-both}" in
    "backend")
        start_backend
        ;;
    "frontend") 
        start_frontend
        ;;
    "both"|*)
        echo "🔄 Starting both frontend and backend..."
        echo "   Backend will start on: http://localhost:8080"
        echo "   Frontend will start on: http://localhost:5174"
        echo ""
        echo "💡 Tip: Open two terminals and run:"
        echo "   Terminal 1: ./scripts/dev-start.sh backend"
        echo "   Terminal 2: ./scripts/dev-start.sh frontend"
        echo ""
        echo "Press Ctrl+C to stop servers"
        echo ""
        
        # Start both in background and wait for interrupt
        start_backend &
        BACKEND_PID=$!
        
        sleep 3
        start_frontend &
        FRONTEND_PID=$!
        
        # Wait for interrupt and cleanup
        trap 'echo "🛑 Stopping servers..."; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0' INT
        wait
        ;;
esac 