# Production Multi-Stage Dockerfile for WhatsUS
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install all dependencies (including devDependencies for building)
RUN npm ci

# Copy full source
COPY . .

# Generate Prisma Client
RUN npm run db:generate --workspace=server

# Build server and client
RUN npm run build:server
RUN npm run build

# Production Runner
FROM node:20-bookworm-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Install openssl for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy root and package manifests
COPY package*.json ./
COPY client/package*.json ./client/
COPY server/package*.json ./server/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma schema and entrypoint script
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/docker-entrypoint.sh ./server/docker-entrypoint.sh
RUN chmod +x ./server/docker-entrypoint.sh

# Generate Prisma client for runner environment
RUN cd server && npx prisma generate

# Copy built server and client dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Create uploads directory and set non-root user permissions
RUN mkdir -p /app/server/uploads && chown -R node:node /app

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

ENTRYPOINT ["/app/server/docker-entrypoint.sh"]
