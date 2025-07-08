# Security Guidelines for Twogether

## 🔒 Security Improvements Made

This document outlines the security improvements implemented to protect sensitive information in the Twogether project.

### Issues Fixed

1. **Hardcoded Secrets Removed**
   - ❌ **Before**: Real Supabase JWT tokens were hardcoded in `docker-compose.yml`
   - ❌ **Before**: Database passwords were hardcoded in scripts
   - ✅ **After**: All secrets now use environment variables from `.env` file

2. **Sensitive Files Removed from Git**
   - ❌ **Before**: `love_time.db` database file was tracked (contains user data)
   - ❌ **Before**: SQLX query cache files were tracked (contain schema info)
   - ✅ **After**: All sensitive files removed and added to `.gitignore`

3. **Environment Configuration Secured**
   - ✅ **After**: `.env` file is properly ignored by git
   - ✅ **After**: `env.example` provides secure template with clear instructions
   - ✅ **After**: All scripts check for `.env` file existence

## 🛠️ Required Setup

### 1. Create Your Environment File

```bash
cp env.example .env
```

### 2. Update Critical Security Variables

Edit `.env` and change these **required** variables:

```bash
# CHANGE THESE IMMEDIATELY:
POSTGRES_PASSWORD=YOUR_SECURE_PASSWORD_HERE
JWT_SECRET=YOUR_LONG_RANDOM_STRING_HERE
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

### 3. Get Supabase Credentials

1. Go to [https://supabase.com](https://supabase.com)
2. Create a new project or select existing one
3. Go to **Settings** → **API**
4. Copy your:
   - Project URL (`SUPABASE_URL`)
   - `anon` `public` key (`SUPABASE_ANON_KEY`)
   - `service_role` `secret` key (`SUPABASE_SERVICE_ROLE_KEY`)

## 🚨 Security Best Practices

### Environment Variables
- ✅ **DO**: Use `.env` file for all secrets
- ✅ **DO**: Use different secrets for development and production
- ❌ **DON'T**: Commit `.env` file to version control
- ❌ **DON'T**: Share your `SUPABASE_SERVICE_ROLE_KEY` (it has admin access)

### Passwords and Secrets
- ✅ **DO**: Use long, random strings for `JWT_SECRET` (minimum 32 characters)
- ✅ **DO**: Use strong passwords for `POSTGRES_PASSWORD`
- ✅ **DO**: Rotate secrets regularly in production
- ❌ **DON'T**: Use default passwords in production

### File Security
- ✅ **DO**: Keep database files (`.db`, `.sqlite`) out of version control
- ✅ **DO**: Keep log files and uploads out of version control
- ❌ **DON'T**: Commit any files containing user data

## 📁 Files Protected

The following file patterns are now properly ignored by git:

```gitignore
# Environment files
.env
.env.local
.env.production
.env.test

# Database files  
*.db
*.sqlite
*.sqlite3
love_time.db
twogether.db

# SQLX query cache
**/.sqlx/

# Additional sensitive files
*.key
*.pem
*.p12
```

## 🔍 Verification

To verify your setup is secure:

1. **Check no secrets in git**: `git log --oneline -10` should show the security commit
2. **Check .env is ignored**: `git status` should not show `.env` file
3. **Check variables load**: Scripts should load from `.env` successfully

## 🚀 Running Securely

After setting up your `.env` file:

```bash
# Start development environment
./start-dev.sh

# Or use Docker Compose (will load .env automatically)
docker-compose up
```

## ⚠️ Important Notes

- **Breaking Change**: You must create `.env` file before running the application
- **Supabase Required**: The application needs valid Supabase credentials to function
- **Production**: Use separate, secure credentials for production deployments
- **GitHub Secrets**: For CI/CD, store secrets in GitHub repository settings

## 🆘 If You Accidentally Commit Secrets

If secrets were accidentally committed to git:

1. **Immediately rotate** the compromised secrets
2. **Remove from git history** using `git filter-branch` or similar
3. **Update** your `.env` with new secrets
4. **Consider** making the repository private temporarily

---

**Remember**: Security is an ongoing process. Regularly review and update your secrets and security practices. 