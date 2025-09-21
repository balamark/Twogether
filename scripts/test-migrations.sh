#!/bin/bash

# Test migration script for local PostgreSQL database

set -e

DB_NAME="twogether_test"
DB_USER="twogether"
DB_PASSWORD="twogether123"

echo "🧪 Testing migrations on fresh database..."

# Create test database
echo "📝 Creating test database '$DB_NAME'..."
createdb -O $DB_USER $DB_NAME 2>/dev/null || {
    echo "   Dropping existing test database..."
    dropdb $DB_NAME
    createdb -O $DB_USER $DB_NAME
}

# Set environment for test database
export DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@localhost:5432/$DB_NAME"
export NODE_ENV=development

echo "✅ Test database created"

# Run migrations
echo "🔄 Running migrations..."
npm run migrate

# Verify critical tables exist
echo "🔍 Verifying tables..."
psql $DATABASE_URL -c "\dt" | grep -E "(users|couples|intimacy_requests|intimacy_templates)" || {
    echo "❌ Critical tables missing!"
    exit 1
}

# Verify intimacy_requests has correct columns
echo "🔍 Verifying intimacy_requests schema..."
psql $DATABASE_URL -c "\d intimacy_requests" | grep -E "(sender_id|receiver_id|message_content)" || {
    echo "❌ intimacy_requests table schema incorrect!"
    exit 1
}

# Check compliment templates
echo "🔍 Verifying compliment templates..."
COMPLIMENT_COUNT=$(psql $DATABASE_URL -t -c "SELECT COUNT(*) FROM intimacy_templates WHERE category = 'compliment';")
if [ "$COMPLIMENT_COUNT" -lt 10 ]; then
    echo "❌ Expected at least 10 compliment templates, found $COMPLIMENT_COUNT"
    exit 1
fi

echo "✅ All migrations successful!"
echo "✅ Database schema verified!"
echo "✅ Compliment templates loaded!"

# Clean up
echo "🧹 Cleaning up test database..."
dropdb $DB_NAME

echo "🎉 Migration test completed successfully!"