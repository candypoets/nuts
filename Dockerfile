# Multi-stage build for NutsCash SvelteKit application (build with Node, run with Bun)
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Explicitly install the missing optional dependency for Linux musl
RUN npm install --no-save @rollup/rollup-linux-x64-musl

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/build ./build

# Copy the custom server file
COPY --from=builder /app/server.js ./server.js

EXPOSE 3000

# Start the Node.js server with custom server
CMD ["node", "server.js"]
