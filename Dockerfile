FROM node:26-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (no private registry needed — SDK is vendored in-repo)
RUN npm ci --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune dev dependencies in builder stage (has auth)
RUN npm prune --omit=dev

# Production stage
FROM node:26-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV AUTH_MODE=gateway
ENV MCP_HTTP_PORT=8080

# Create non-root user
RUN addgroup -g 1001 -S mcp && adduser -u 1001 -S mcp -G mcp

# Copy built application and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/manifest.json ./

# OCI label for GHCR repository linking
LABEL org.opencontainers.image.source=https://github.com/WYRE-AI/timezest-mcp
LABEL io.modelcontextprotocol.server.name="io.github.WYRE-AI/timezest-mcp"

# Switch to non-root user
USER mcp

# Expose HTTP port
EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]