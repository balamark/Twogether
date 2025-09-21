# GitHub Actions Secrets Setup Guide

This document outlines the required secrets that need to be configured in your GitHub repository settings for the CI/CD pipeline to work properly.

## Required GitHub Secrets

Go to your repository → Settings → Secrets and variables → Actions → Repository secrets

### Production Deployment Secrets

These are used for deploying to Google Cloud Platform:

1. **GCP_SA_KEY**
   - Description: Google Cloud Service Account Key (JSON format)
   - How to get: Create a service account in GCP Console with App Engine Admin permissions
   - Format: Full JSON key file content

2. **GCP_PROJECT_ID** 
   - Description: Your Google Cloud Project ID
   - Example: `twogether-app-12345`

### Production Database & Services

3. **DATABASE_URL**
   - Description: Production PostgreSQL database connection string
   - Example: `postgresql://user:password@host:5432/twogether_prod`

4. **JWT_SECRET**
   - Description: Secret key for JWT token signing (production)
   - Example: `your-super-secure-jwt-secret-key-here`

### Supabase Configuration

5. **SUPABASE_URL**
   - Description: Your Supabase project URL
   - Example: `https://your-project.supabase.co`

6. **SUPABASE_ANON_KEY**
   - Description: Supabase anonymous/public key
   - Found in: Supabase Dashboard → Settings → API

7. **SUPABASE_SERVICE_ROLE_KEY**
   - Description: Supabase service role key (private)
   - Found in: Supabase Dashboard → Settings → API

### Email Configuration

8. **EMAIL_FROM**
   - Description: Email address for sending notifications
   - Example: `noreply@yourdomain.com`

9. **EMAIL_PASS**
   - Description: Email service password/app password
   - Note: Use app-specific password for Gmail

10. **RESEND_API_KEY** (if using Resend)
    - Description: Resend API key for email delivery
    - Found in: Resend Dashboard → API Keys

### CORS Configuration

11. **CORS_ORIGIN**
    - Description: Allowed CORS origins for production
    - Example: `https://yourdomain.com`

## Test Environment

The CI pipeline automatically sets up a test environment with:
- Local PostgreSQL database (`twogether_test`)
- Test-specific environment variables
- Isolated test server on port 8080

No additional setup required for testing - it uses the PostgreSQL service defined in GitHub Actions.

## Deployment Flow

1. **Pull Request**: Runs tests only (no deployment)
2. **Main Branch Push**: Runs tests + deploys to production if tests pass
3. **Manual Trigger**: Can be run manually from GitHub Actions tab

## Troubleshooting

### Common Issues:

1. **Missing Secrets**: Check that all required secrets are set
2. **GCP Authentication**: Ensure service account has proper permissions
3. **Database Connection**: Verify production DATABASE_URL is correct
4. **Environment Variables**: Double-check all URLs and keys

### Debugging Steps:

1. Check GitHub Actions logs for specific error messages
2. Verify secrets are not empty (GitHub shows if they exist)
3. Test database connections manually
4. Validate GCP project and service account permissions

## Testing Locally

To test the CI script locally:

```bash
# Set environment variables
export DATABASE_URL="postgresql://localhost:5432/twogether_test"
export JWT_SECRET="test-secret-key"
# ... other env vars

# Run CI test script
npm run test:ci
```