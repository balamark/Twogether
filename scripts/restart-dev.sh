#!/bin/bash

# Twogether Development Server Restart Script
# This script safely kills all running development processes and restarts them

echo "🔄 Restarting Twogether development servers..."

# Kill existing processes
echo "🛑 Stopping existing processes..."
pkill -f "npm run dev" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true  
pkill -f "cargo run" 2>/dev/null || true

# Wait for processes to fully terminate
sleep 2

# Check if ports are still in use and force kill if necessary
if lsof -ti:5174 >/dev/null 2>&1; then
    echo "🔧 Force killing process on port 5174..."
    lsof -ti:5174 | xargs kill -9 2>/dev/null || true
fi

if lsof -ti:8080 >/dev/null 2>&1; then
    echo "🔧 Force killing process on port 8080..."
    lsof -ti:8080 | xargs kill -9 2>/dev/null || true
fi

# Start database if not running
echo "🗄️ Starting database..."
if ! docker-compose ps postgres | grep -q "Up"; then
    docker-compose up -d postgres
    echo "⏳ Waiting for database to be ready..."
    sleep 5
fi

# Start backend in background
echo "🦀 Starting backend server..."
cd backend
cargo run > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 3

# Start frontend in background  
echo "⚛️ Starting frontend server..."
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# Wait for servers to start
sleep 3

# Check if servers are running
echo "🔍 Checking server status..."

# Check backend
if curl -s http://localhost:8080/health >/dev/null 2>&1; then
    echo "✅ Backend server is running on http://localhost:8080"
else
    echo "❌ Backend server failed to start. Check backend.log for errors."
fi

# Check frontend
if curl -s http://localhost:5174 >/dev/null 2>&1; then
    echo "✅ Frontend server is running on http://localhost:5174"
else
    echo "❌ Frontend server failed to start. Check frontend.log for errors."
fi

echo ""
echo "🎉 Development servers restarted!"
echo "📱 Frontend: http://localhost:5174"
echo "🔧 Backend API: http://localhost:8080"
echo "🗄️ Database: http://localhost:8081 (pgAdmin)"
echo ""
echo "📋 View logs:"
echo "   Backend:  tail -f backend.log"
echo "   Frontend: tail -f frontend.log"
echo "   Database: docker-compose logs -f postgres"
echo ""
echo "🛑 To stop all servers: pkill -f 'npm run dev' && pkill -f 'cargo run'" 