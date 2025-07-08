#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse command line arguments
LOG_TO_FILE=false
LOG_FILE_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --log-file)
            LOG_TO_FILE=true
            LOG_FILE_PATH="${2:-logs/backend.log}"
            shift 2
            ;;
        --log-file=*)
            LOG_TO_FILE=true
            LOG_FILE_PATH="${1#*=}"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--log-file [path]]"
            echo ""
            echo "Options:"
            echo "  --log-file [path]    Enable file logging (default: logs/backend.log)"
            echo "  -h, --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                          # Console logging (default)"
            echo "  $0 --log-file               # File logging to logs/backend.log"
            echo "  $0 --log-file=/tmp/app.log  # File logging to custom path"
            exit 0
            ;;
        *)
            echo -e "${RED}❌ Unknown option: $1${NC}"
            echo "Use -h or --help for usage information."
            exit 1
            ;;
    esac
done

echo -e "${GREEN}🚀 Starting Twogether Development Environment${NC}"

if [ "$LOG_TO_FILE" = true ]; then
    echo -e "${BLUE}📝 Backend logs will be written to: $LOG_FILE_PATH${NC}"
    # Ensure log directory exists
    mkdir -p "$(dirname "$LOG_FILE_PATH")"
fi

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
cd backend
DATABASE_URL="$DATABASE_URL" sqlx migrate run --source migrations
cd ..

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
if [ "$LOG_TO_FILE" = true ]; then
    echo -e "${GREEN}📝 Starting backend with file logging enabled...${NC}"
    cargo run -- --log-file "$LOG_FILE_PATH"
else
    echo -e "${GREEN}📺 Starting backend with console logging...${NC}"
    cargo run
fi

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