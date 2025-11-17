# Multi-stage build for NutsCash SvelteKit application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first (for dep installation)
COPY package*.json ./

# Install all dependencies (for build) - use npm install to handle platform-specific deps
RUN npm install

# Copy source code
COPY . .

# Fix for Rollup optional deps: Remove any pre-existing node_modules and lockfile,
# then reinstall to ensure compatibility with Alpine (musl libc)
RUN rm -rf node_modules package-lock.json && \
    npm install

# Build the application (generates build/index.js, build/client/, etc.)
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application (includes build/index.js and all subfolders/files)
COPY --from=builder /app/build ./build

EXPOSE 3000

# Start the default adapter-node server
CMD ["node", "build/index.js"]
