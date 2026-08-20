# Build stage
FROM node:22-alpine AS build

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
FROM node:22-alpine AS runtime

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
COPY --from=build /app/sqlite-init.sql ./
COPY --from=build /app/firebase-applet-config.json ./
COPY --from=build /app/database.ts ./
COPY --from=build /app/firebase-admin.ts ./
COPY --from=build /app/types.ts ./
COPY --from=build /app/server.ts ./

EXPOSE 3000

# Start production server
CMD ["node", "dist/server.cjs"]

