# Production Multi-Stage Dockerfile for WhatsWeb
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy root and package manifests
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

# Copy Prisma schema and migrations
COPY --from=builder /app/server/prisma ./server/prisma
RUN cd server && npx prisma generate

# Copy built server and client dist
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Create uploads directory
RUN mkdir -p /app/server/uploads

EXPOSE 3001

VOLUME ["/app/server/prisma", "/app/server/uploads"]

CMD ["node", "server/dist/index.js"]
