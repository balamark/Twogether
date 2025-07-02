#!/bin/bash

# Twogether Development Logs Viewer
# This script helps you view logs from all development services

echo "📋 Twogether Development Logs Viewer"
echo "Select which logs to view:"
echo ""
echo "1) Frontend logs (live)"
echo "2) Backend logs (live)" 
echo "3) Database logs (live)"
echo "4) All logs (combined)"
echo "5) Process status"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        echo "📱 Viewing frontend logs (Ctrl+C to exit)..."
        if [ -f frontend.log ]; then
            tail -f frontend.log
        else
            echo "❌ frontend.log not found. Is the frontend server running?"
            echo "Start with: cd frontend && npm run dev"
        fi
        ;;
    2)
        echo "🦀 Viewing backend logs (Ctrl+C to exit)..."
        if [ -f backend.log ]; then
            tail -f backend.log
        else
            echo "❌ backend.log not found. Is the backend server running?"
            echo "Start with: cd backend && cargo run"
        fi
        ;;
    3)
        echo "🗄️ Viewing database logs (Ctrl+C to exit)..."
        if docker-compose ps postgres | grep -q "Up"; then
            docker-compose logs -f postgres
        else
            echo "❌ Database is not running."
            echo "Start with: docker-compose up -d postgres"
        fi
        ;;
    4)
        echo "📋 Viewing all logs (Ctrl+C to exit)..."
        if [ -f frontend.log ] && [ -f backend.log ]; then
            echo "Combining frontend, backend, and database logs..."
            tail -f frontend.log backend.log & 
            docker-compose logs -f postgres 2>/dev/null &
            wait
        else
            echo "❌ Some log files are missing. Are all servers running?"
        fi
        ;;
    5)
        echo "🔍 Current process status:"
        echo ""
        
        # Check npm processes
        if pgrep -f "npm run dev" > /dev/null; then
            echo "✅ Frontend (npm): Running"
        else
            echo "❌ Frontend (npm): Not running"
        fi
        
        # Check cargo processes
        if pgrep -f "cargo run" > /dev/null; then
            echo "✅ Backend (cargo): Running" 
        else
            echo "❌ Backend (cargo): Not running"
        fi
        
        # Check database
        if docker-compose ps postgres | grep -q "Up"; then
            echo "✅ Database (PostgreSQL): Running"
        else
            echo "❌ Database (PostgreSQL): Not running"
        fi
        
        echo ""
        echo "Port usage:"
        lsof -i :5174 2>/dev/null && echo "Port 5174: ✅ In use (Frontend)" || echo "Port 5174: ❌ Free"
        lsof -i :8080 2>/dev/null && echo "Port 8080: ✅ In use (Backend)" || echo "Port 8080: ❌ Free"  
        lsof -i :5432 2>/dev/null && echo "Port 5432: ✅ In use (Database)" || echo "Port 5432: ❌ Free"
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        ;;
esac 