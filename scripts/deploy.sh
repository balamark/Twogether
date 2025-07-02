#!/bin/bash

# Twogether Production Deployment Script
# This script handles production deployment to Google Cloud Platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Deploying Twogether to Google Cloud Platform...${NC}"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Google Cloud SDK is not installed. Please install it first.${NC}"
    exit 1
fi

# Check if logged in to gcloud
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "@"; then
    echo -e "${RED}❌ Not logged in to Google Cloud. Please run 'gcloud auth login' first.${NC}"
    exit 1
fi

# Check required environment variables
required_vars=("GCP_PROJECT_ID" "DATABASE_URL" "JWT_SECRET" "CORS_ORIGIN" "GCS_BUCKET_NAME")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Environment variable $var is not set.${NC}"
        exit 1
    fi
done

echo -e "${YELLOW}📋 Deployment Configuration:${NC}"
echo "  Project ID: $GCP_PROJECT_ID"
echo "  Region: us-central1"
echo "  Service: twogether-backend"
echo "  Frontend Bucket: $GCS_BUCKET_NAME"

# Set the project
gcloud config set project $GCP_PROJECT_ID

# Build and push Docker image
echo -e "${GREEN}🐳 Building and pushing Docker image...${NC}"
cd backend
docker build -t gcr.io/$GCP_PROJECT_ID/twogether-backend:latest .
docker push gcr.io/$GCP_PROJECT_ID/twogether-backend:latest
cd ..

# Deploy to Cloud Run
echo -e "${GREEN}☁️ Deploying backend to Cloud Run...${NC}"
gcloud run deploy twogether-backend \
    --image gcr.io/$GCP_PROJECT_ID/twogether-backend:latest \
    --platform managed \
    --region us-central1 \
    --allow-unauthenticated \
    --set-env-vars="DATABASE_URL=$DATABASE_URL" \
    --set-env-vars="JWT_SECRET=$JWT_SECRET" \
    --set-env-vars="ENVIRONMENT=production" \
    --set-env-vars="CORS_ORIGIN=$CORS_ORIGIN" \
    --memory=512Mi \
    --cpu=1 \
    --max-instances=10

# Build frontend
echo -e "${GREEN}📦 Building frontend...${NC}"
cd frontend
npm ci
npm run build
cd ..

# Deploy frontend to Cloud Storage
echo -e "${GREEN}☁️ Deploying frontend to Cloud Storage...${NC}"
gsutil -m rsync -r -d ./frontend/dist gs://$GCS_BUCKET_NAME
gsutil -m setmeta -h "Cache-Control:public, max-age=86400" gs://$GCS_BUCKET_NAME/**

# Get backend URL
BACKEND_URL=$(gcloud run services describe twogether-backend --region=us-central1 --format="value(status.url)")

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo "📊 Deployment Summary:"
echo "  Backend URL: $BACKEND_URL"
echo "  Frontend URL: https://storage.googleapis.com/$GCS_BUCKET_NAME/index.html"
echo "  Health Check: $BACKEND_URL/health"
echo ""
echo "🔗 Useful Commands:"
echo "  View logs: gcloud run services logs read twogether-backend --region=us-central1"
echo "  View metrics: gcloud run services describe twogether-backend --region=us-central1" 