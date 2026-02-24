# Multi-stage build for NutsCash SvelteKit application
FROM node:20-alpine AS builder

# Install build tools required for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

ARG VITE_INDEXER_RELAYS="wss://relay.nostr.band,wss://purplepag.es,wss://relay.damus.io"
ARG VITE_SEARCH_RELAYS="wss://relay.nostr.band"
ARG VITE_DEFAULT_RELAYS="wss://relay.thibautduchene.fr,wss://relay.damus.io,wss://nos.lol"
ARG PUBLIC_LNUTS_DOMAIN="nuts.cash"
ARG VITE_ENABLE_SSL="false"

# Set environment variables from build arguments
ENV VITE_INDEXER_RELAYS=$VITE_INDEXER_RELAYS
ENV VITE_SEARCH_RELAYS=$VITE_SEARCH_RELAYS
ENV VITE_DEFAULT_RELAYS=$VITE_DEFAULT_RELAYS
ENV PUBLIC_LNUTS_DOMAIN=$PUBLIC_LNUTS_DOMAIN
ENV VITE_ENABLE_SSL=$VITE_ENABLE_SSL

# Copy ONLY package.json (ignore local package-lock.json to fix cross-platform Rollup issues)
COPY package.json ./

# Install dependencies (this generates a fresh, correct package-lock.json for Alpine)
RUN npm install

# Copy source code
COPY . .

# Clean any cached SvelteKit/build artifacts (prevents stale cache issues)
RUN rm -rf .svelte-kit build

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

# Install build tools for native modules in production
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy package.json
COPY package.json ./

# Copy the Alpine-compatible lockfile generated in the builder stage
COPY --from=builder /app/package-lock.json ./

# Install only production dependencies using the fresh lockfile
RUN npm ci --only=production && npm cache clean --force

# Copy built application
COPY --from=builder /app/build ./build

EXPOSE 3000

# Start the server
CMD ["node", "build/index.js"]
