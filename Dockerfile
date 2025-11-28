# Multi-stage build for NutsCash SvelteKit application
FROM node:20-alpine AS builder

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

# Copy package files first (for dep installation)
COPY package*.json ./

RUN npm install

# Copy source code
COPY . .


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
