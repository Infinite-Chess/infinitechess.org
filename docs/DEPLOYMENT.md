# Deployment Guide

This document describes how to deploy infinitechess.org using the industry-standard pre-built deployment pattern.

## 🎯 Overview

The project now follows the standard Node.js deployment pattern:

- **Build once** in CI/CD or locally with all dependencies
- **Deploy the built artifacts** (dist/ folder)
- **Run in production** with only runtime dependencies

## 📦 What Changed

### Before (Build on Server)

```bash
git pull
npm install              # All deps (dev + prod)
npm run prod            # build && tsc && start
```

### After (Pre-built Deployment)

```bash
# Build Stage (CI/CD or local)
npm ci                  # All deps
npm run build          # Build once
npm test               # Test

# Production Stage
npm ci --production    # Runtime deps only (29 packages)
npm start              # Run pre-built code
```

### Package Changes

**Moved to devDependencies** (6 packages):

- `@swc/core` - JavaScript minifier
- `browserslist` - CSS target calculator
- `esbuild` - TypeScript transpiler
- `glob` - File finder for build
- `lightningcss` - CSS minifier
- `sharp` - Image optimization utility

**Result**: Production now installs 29 packages instead of 35.

---

## 🚀 Deployment Methods

### Method 1: GitHub Actions (Recommended)

The project already has GitHub Actions CI/CD configured (`.github/workflows/ci.yml`).

**To deploy:**

1. **Build & Test** (automated on push)

    ```yaml
    # GitHub Actions already does:
    npm ci
    npm run build
    npm test
    ```

2. **Create deployment artifact** (add to GitHub Actions)

    ```yaml
    - name: Create deployment artifact
      run: |
          tar -czf deploy.tar.gz dist/ package.json package-lock.json

    - name: Upload artifact
      uses: actions/upload-artifact@v4
      with:
          name: deployment
          path: deploy.tar.gz
    ```

3. **Deploy to server** (SSH or your deployment tool)

    ```bash
    # Download artifact to server
    scp deploy.tar.gz user@server:/app/

    # On server:
    cd /app
    tar -xzf deploy.tar.gz
    npm ci --production
    npm start  # or pm2 restart, systemd restart, etc.
    ```

### Method 2: Manual Deployment

**Build locally:**

```bash
npm ci                 # Install all dependencies
npm run build         # Build the project
npm test              # Run tests
```

**Deploy to server:**

```bash
# Copy these files to production:
# - dist/ folder (built code)
# - package.json
# - package-lock.json
# - Any other necessary files (.env, database/, etc.)

rsync -avz --exclude 'node_modules' \
  dist/ package.json package-lock.json user@server:/app/

# On production server:
cd /app
npm ci --production   # Install only runtime dependencies
npm start             # Start the server
```

### Method 3: Docker (Alternative)

**Dockerfile example:**

```dockerfile
# Build stage
FROM node:20 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY --from=builder /app/dist ./dist
# Copy other necessary files
COPY translation ./translation
CMD ["npm", "start"]
```

---

## 🔄 New Workflow

### Development

```bash
npm install           # Install all dependencies (dev + prod)
npm run dev          # Start development server with watch mode
```

### Building

```bash
npm run build        # Build for production
# This runs:
# 1. generate:types - Generate TypeScript types
# 2. clean - Remove old dist/
# 3. copy:views - Copy EJS templates
# 4. prod:assets - Copy static assets
# 5. tsx build/index.ts - Transpile & bundle
```

### Production Startup

```bash
# After deploying dist/ and package.json:
npm ci --production  # Install runtime dependencies only
npm start            # Run: node dist/server/server.js
```

### Quick Commands

```bash
npm run prod         # Now just runs: npm start
npm start            # Runs: node dist/server/server.js
npm run dev          # Development with watch mode
npm test             # Run tests
npm run lint         # Lint code
```

---

## 🔍 Troubleshooting

### "Cannot find module 'esbuild'" in production

**Solution**: You're trying to build in production. Build before deploying.

```bash
# Do this BEFORE deploying:
npm ci && npm run build

# Then deploy dist/ folder
```

### "Module not found" errors at runtime

**Solution**: Make sure you ran `npm ci --production` on the server.

```bash
cd /app
npm ci --production
```

### Need to rebuild on server?

**Not recommended**, but if you must:

```bash
# Install ALL dependencies (including dev)
npm ci

# Build
npm run build

# Then you can run with production deps only
npm ci --production
npm start
```

---

## ✅ Benefits of This Approach

1. **Security**: Production only has 29 runtime packages (vs 35 before)
2. **Performance**: No build time on server startup
3. **Reliability**: Build failures caught in CI/CD, not production
4. **Best Practice**: Industry standard used by 99% of Node.js apps
5. **Testability**: Can test the exact build artifact before deploy

---

## 📚 Additional Resources

- **CI/CD Config**: `.github/workflows/ci.yml`
- **Build Scripts**: `build/` directory
- **Contributing**: `docs/CONTRIBUTING.md`
- **Package.json Scripts**: See `package.json`

---

## 🤔 FAQ

**Q: Why not build on every server restart?**  
A: Building requires dev dependencies and takes time. Pre-building is faster, more secure, and the industry standard.

**Q: What if I git pull new changes?**  
A: Build in CI/CD or locally, then deploy the new dist/ folder.

**Q: Can I still use `npm run prod`?**  
A: Yes! It now just runs `npm start` (no build). Build separately with `npm run build`.

**Q: What about the old workflow?**  
A: The old `npm run prod` that included building required dev dependencies in production, which is not best practice.
