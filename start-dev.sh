#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting Twogether Development Environment${NC}"

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating from env.example...${NC}"
    cp env.example .env
    echo -e "${RED}❗ Please edit .env with your actual configuration before continuing.${NC}"
    echo -e "${BLUE}📝 You need to set your Supabase credentials in .env${NC}"
    exit 1
fi

# Load environment variables from .env (only valid assignments, skip comments)
echo -e "${BLUE}📋 Loading environment variables from .env...${NC}"
while IFS= read -r line; do
    # Skip empty lines and comments
    if [[ -n "$line" && ! "$line" =~ ^[[:space:]]*# ]]; then
        # Only export lines that contain = (valid variable assignments)
        if [[ "$line" =~ = ]]; then
            export "$line"
        fi
    fi
done < .env

# Run database migrations
echo -e "${BLUE}📊 Running database migrations...${NC}"
DATABASE_URL="$DATABASE_URL" sqlx migrate run --source migrations

# Start backend
echo -e "${BLUE}🔧 Starting backend server...${NC}"
export DATABASE_URL="$DATABASE_URL"
export JWT_SECRET="$JWT_SECRET"
export CORS_ORIGIN="$CORS_ORIGIN"
export PORT=8080
export ENVIRONMENT=development
export UPLOAD_PATH="./uploads"
export MAX_FILE_SIZE=10485760

# Export Supabase configuration from .env
export SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"

# Ensure uploads directory exists
mkdir -p uploads

# Navigate to backend directory and start
cd backend

echo -e "${GREEN}✅ Environment loaded from .env file${NC}"
echo -e "${BLUE}🚀 Starting Rust backend...${NC}"
echo -e "${YELLOW}📝 Backend will be available at http://localhost:8080${NC}"
echo -e "${YELLOW}📚 API documentation at http://localhost:8080/api/docs${NC}"

# Start the backend
cargo run

echo -e "${GREEN}🛑 Backend stopped${NC}"

# Instructions for next steps
echo ""
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "${YELLOW}  1. Open another terminal${NC}"
echo -e "${YELLOW}  2. Navigate to frontend directory: cd frontend${NC}"
echo -e "${YELLOW}  3. Install dependencies: npm install${NC}"
echo -e "${YELLOW}  4. Start frontend: npm run dev${NC}"
echo ""
echo -e "${GREEN}🌐 Then visit: http://localhost:5174${NC}"

# Development database info
echo ""
echo -e "${BLUE}📊 Database Info:${NC}"
echo -e "${YELLOW}  • Host: localhost:5432${NC}"
echo -e "${YELLOW}  • Database: twogether_dev${NC}"
echo -e "${YELLOW}  • Username: twogether${NC}"
echo -e "${YELLOW}  • Connection URL loaded from .env${NC}"

echo ""
echo -e "${GREEN}✨ Happy coding!${NC}" 