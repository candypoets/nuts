# Multi-stage build for NutsCash SvelteKit application
FROM node:22-alpine AS builder

# Install build tools required for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

ARG VITE_INDEXER_RELAYS="wss://relay.nostr.band,wss://purplepag.es,wss://relay.damus.io"
ARG VITE_SEARCH_RELAYS="wss://relay.nostr.band"
ARG VITE_DEFAULT_RELAYS="wss://relay.nuts.cash,wss://relay.thibautduchene.fr,wss://relay.damus.io,wss://nos.lol"
ARG PUBLIC_LNUTS_DOMAIN="nuts.cash"
ARG VITE_ENABLE_SSL="false"
ARG VITE_NIPWORKER_PROXY_URL
ARG VITE_APP_VERSION
ARG NODE_OPTIONS

# Set environment variables from build arguments
ENV VITE_INDEXER_RELAYS=$VITE_INDEXER_RELAYS
ENV VITE_SEARCH_RELAYS=$VITE_SEARCH_RELAYS
ENV VITE_DEFAULT_RELAYS=$VITE_DEFAULT_RELAYS
ENV PUBLIC_LNUTS_DOMAIN=$PUBLIC_LNUTS_DOMAIN
ENV VITE_NIPWORKER_PROXY_URL=$VITE_NIPWORKER_PROXY_URL
ENV VITE_APP_VERSION=$VITE_APP_VERSION
ENV NODE_OPTIONS=$NODE_OPTIONS

# Copy dependency manifests first for better Docker layer caching
COPY package.json package-lock.json ./

# Install exactly the dependency graph committed to the repository
RUN npm ci

# Copy source code
COPY . .

# Clean any cached SvelteKit/build artifacts (prevents stale cache issues)
RUN rm -rf .svelte-kit build

# Build the application
RUN npm run build

# Build the custom server
RUN npx tsc server.ts --esModuleInterop --target ES2022 --module nodenext --moduleResolution nodenext --skipLibCheck --outDir .

# Production stage
FROM node:22-alpine AS runner

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

# Copy built application and server
COPY --from=builder /app/build ./build
COPY --from=builder /app/server.js ./server.js

EXPOSE 3000

# Start the custom server (with nipworker proxy attached)
CMD ["node", "server.js"]
