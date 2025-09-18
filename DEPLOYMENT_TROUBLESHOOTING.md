# Deployment Troubleshooting Guide

This document chronicles the deployment issues encountered and resolved for the Twogether app, serving as a reference for future deployments and similar projects.

## Summary

We successfully resolved a series of deployment failures that were causing 10+ minute timeouts in Google Cloud Build when deploying a Rust backend to App Engine Flexible. The final solution reduced deployment time from 15+ minutes (with frequent timeouts) to ~8-10 minutes with reliable success.

## Issues and Solutions

### 1. **Rust Compilation Timeout in Cloud Build**

**Problem**: Rust compilation with heavy dependencies (sqlx, bcrypt, tower, hyper) took 15+ minutes, exceeding Cloud Build's time limits.

**Error Messages**:
```
TIMEOUT ERROR: context deadline exceeded
Cloud build did not succeed within 10m
Step #1: Compiling [various Rust crates]...
```

**Root Cause**: Rust compilation is inherently slow, especially with crypto and async dependencies. Cloud Build has strict timeout limits that don't work well with Rust's compilation time.

**Solution**: **Move Docker build to GitHub Actions**
- Build Rust Docker image in GitHub Actions (better resources, longer timeouts)
- Push pre-built image to Google Container Registry (GCR)
- Use Cloud Build only for lightweight App Engine deployment

**Files Changed**:
- `.github/workflows/deploy.yml` - Added Docker build and push steps
- `cloudbuild.yaml` - Removed Docker build, use pre-built image

---

### 2. **App Engine Custom Runtime Requirements**

**Problem**: App Engine Flexible requires either a `Dockerfile` or `cloudbuild.yaml` even when using pre-built container images.

**Error Message**:
```
Error Response: [3] "runtime: custom" requires either cloudbuild.yaml or Dockerfile to be present.
```

**Root Cause**: App Engine Flex doesn't support pure container image deployment without build files present.

**Solution**: **Create minimal Dockerfile referencing pre-built image**
```dockerfile
FROM gcr.io/$PROJECT_ID/twogether-backend:$IMAGE_TAG
```

**Files Changed**:
- `cloudbuild.yaml` - Create minimal Dockerfile dynamically
- App Engine uses this to pull the pre-built image

---

### 3. **YAML Syntax Errors in Cloud Build**

**Problem**: Complex multiline Python scripts in YAML caused parsing errors.

**Error Messages**:
```
parsing cloudbuild.yaml: while scanning a quoted scalar
found unexpected end of stream
while scanning a simple key could not find expected ':'
```

**Root Cause**: Triple quotes, heredoc syntax, and multiline strings don't mix well with YAML parsing.

**Solution**: **Use simple heredoc approach**
```yaml
cat > file.yaml << 'HEREDOC'
content here
HEREDOC
```

**Files Changed**:
- `cloudbuild.yaml` - Replaced complex Python with simple shell heredoc

---

### 4. **Cloud Build Substitution Variable Naming**

**Problem**: Custom Cloud Build substitutions must start with underscore prefix.

**Error Message**:
```
INVALID_ARGUMENT: invalid value for 'build.substitutions': key in the template "DATABASE_URL" is not a valid built-in substitution
```

**Root Cause**: Cloud Build requires custom substitutions to use underscore prefix (`_VARIABLE_NAME`).

**Solution**: **Rename substitution variables**
- `DATABASE_URL` → `_DATABASE_URL`
- `JWT_SECRET` → `_JWT_SECRET`
- etc.

**Files Changed**:
- `cloudbuild.yaml` - Updated all custom substitution variables
- `.github/workflows/deploy.yml` - Updated substitution parameters

---

### 5. **OpenSSL Library Compatibility**

**Problem**: Binary compiled against OpenSSL 1.1 but runtime environment had different OpenSSL version.

**Error Message**:
```
libssl.so.1.1: cannot open shared object file: No such file or directory
```

**Root Cause**: Build stage used different Debian version than runtime stage.

**Solution**: **Match base images between build and runtime**
- Build: `rust:slim-bullseye` (OpenSSL 1.1)
- Runtime: `debian:bullseye-slim` (OpenSSL 1.1)
- Install: `libssl1.1` (not `libssl3`)

**Files Changed**:
- `backend/Dockerfile` - Updated runtime base image and package names

---

### 6. **Cumulative Deployment Timeouts**

**Problem**: Deploying frontend and backend together caused cumulative timeouts.

**Error Message**:
```
ERROR: context deadline exceeded (during frontend deployment)
```

**Root Cause**: Single `gcloud app deploy` command for multiple services adds timeouts together.

**Solution**: **Separate deployments with independent timeouts**
- `cloudbuild-backend.yaml` - Backend only (10min timeout)
- `cloudbuild-frontend.yaml` - Frontend only (15min timeout)
- `cloudbuild-dispatch.yaml` - Routing rules (5min timeout)

**Files Changed**:
- Created separate Cloud Build configurations
- Updated GitHub Actions to deploy services independently

---

## Final Architecture

### Successful Deployment Flow:
1. **GitHub Actions** (~5 minutes):
   - Build Rust Docker image with cargo dependencies
   - Push to Google Container Registry
   - Verify image exists

2. **Cloud Build - Backend** (~3 minutes):
   - Create minimal Dockerfile referencing pre-built image
   - Deploy to App Engine Flexible
   - Independent 10-minute timeout

3. **Cloud Build - Frontend** (~10 minutes):
   - Build React/Vite frontend
   - Deploy to App Engine Standard
   - Independent 15-minute timeout

4. **Cloud Build - Dispatch** (~1 minute):
   - Update routing rules
   - Independent 5-minute timeout

### Key Principles:
- **Separate heavy compilation from deployment**
- **Use pre-built images when possible**
- **Match library versions between build and runtime**
- **Deploy services independently**
- **Use appropriate timeouts for each stage**

## Commands for Future Reference

### Test Docker build locally:
```bash
cd backend
docker build -t test-backend .
docker run --rm test-backend ./twogether-backend --version
```

### Verify image in GCR:
```bash
gcloud container images describe gcr.io/PROJECT_ID/twogether-backend:TAG
```

### Deploy individual services:
```bash
# Backend only
gcloud builds submit --config=cloudbuild-backend.yaml

# Frontend only
gcloud builds submit --config=cloudbuild-frontend.yaml

# Routing rules
gcloud builds submit --config=cloudbuild-dispatch.yaml
```

## Lessons Learned

1. **Heavy compilation belongs in CI/CD with better resources** - Don't try to compile large Rust projects in Cloud Build
2. **Library compatibility is critical** - Match base images between build and runtime stages
3. **YAML complexity leads to syntax errors** - Keep Cloud Build scripts simple
4. **Cloud provider constraints require workarounds** - App Engine has specific requirements that must be accommodated
5. **Independent deployments are more reliable** - Separate services to avoid cumulative failures
6. **Timeout planning is essential** - Different services need different timeout allocations

## References

- [Google Cloud Build Documentation](https://cloud.google.com/build/docs)
- [App Engine Flexible Runtime](https://cloud.google.com/appengine/docs/flexible/custom-runtimes)
- [Rust Docker Best Practices](https://docs.docker.com/language/rust/)
- [Cloud Build Substitutions](https://cloud.google.com/build/docs/configuring-builds/substitute-variable-values)