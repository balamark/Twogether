#!/bin/bash

# Setup script for local PostgreSQL database for Twogether development

set -e

DB_NAME="twogether_dev"
DB_USER="twogether"
DB_PASSWORD="twogether123"

echo "🚀 Setting up local PostgreSQL database for Twogether..."

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install it first:"
    echo "   On macOS: brew install postgresql"
    echo "   On Ubuntu: sudo apt-get install postgresql postgresql-contrib"
    exit 1
fi

# Check if PostgreSQL service is running
if ! pg_isready -h localhost -p 5432 &> /dev/null; then
    echo "⚠️  PostgreSQL service is not running. Starting it..."
    if command -v brew &> /dev/null; then
        # macOS with Homebrew
        brew services start postgresql
    else
        # Linux
        sudo systemctl start postgresql
    fi

    # Wait for PostgreSQL to start
    sleep 3

    if ! pg_isready -h localhost -p 5432 &> /dev/null; then
        echo "❌ Failed to start PostgreSQL. Please start it manually and try again."
        exit 1
    fi
fi

echo "✅ PostgreSQL is running"

# Create database user if not exists
echo "📝 Creating database user '$DB_USER'..."
psql postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "   User already exists"

# Grant privileges
psql postgres -c "ALTER USER $DB_USER CREATEDB;"

# Create database if not exists
echo "📝 Creating database '$DB_NAME'..."
createdb -O $DB_USER $DB_NAME 2>/dev/null || echo "   Database already exists"

# Grant privileges on database
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

echo "✅ Database setup complete!"

# Create .env.local file with local database configuration
echo "📝 Creating .env.local file..."
cat > .env.local << EOF
# Local development database configuration
DATABASE_URL=postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME

# Keep other environment variables from your main .env file
NODE_ENV=development
PORT=3000
JWT_SECRET=your-local-jwt-secret-key-here

# Add other environment variables as needed
EOF

echo "✅ Created .env.local file"

echo ""
echo "🎉 Local PostgreSQL setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy your environment variables from .env to .env.local"
echo "2. Run migrations: npm run migrate"
echo "3. Start your development server: npm run dev:backend"
echo ""
echo "Database connection details:"
echo "  Host: localhost"
echo "  Port: 5432"
echo "  Database: $DB_NAME"
echo "  Username: $DB_USER"
echo "  Password: $DB_PASSWORD"
echo "  Connection URL: postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
echo ""