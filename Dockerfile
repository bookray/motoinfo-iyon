# Base image argument (uses Google Container Registry mirror to avoid Docker Hub TLS handshake timeout and geo-blocks)
ARG NODE_IMAGE=mirror.gcr.io/library/node:22-alpine

# Build stage
FROM ${NODE_IMAGE} AS build

WORKDIR /app

# Install build tools for native packages like better-sqlite3
RUN apk add --no-cache python3 make g++

# Copy package files and install all dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build frontend + backend bundle
COPY . .
RUN npm run build

# Final runtime stage
FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install runtime dependencies and tools (including curl for healthcheck)
RUN apk add --no-cache python3 make g++ curl

# Install production dependencies
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# Copy compiled build output
COPY --from=build /app/dist ./dist

# Copy backend assets and configs
COPY --from=build /app/sqlite-init.sql* ./
COPY --from=build /app/firebase-applet-config.json* ./

RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

# Start production server
CMD ["node", "dist/server.cjs"]

