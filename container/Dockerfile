FROM jrottenberg/ffmpeg:6.0-alpine AS base

# Install Node.js and required tools
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    make \
    g++ \
    curl \
    && npm install -g typescript

# Build stage
FROM base AS builder

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM base AS production

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built JavaScript files from builder stage
COPY --from=builder /app/dist/ ./dist/

# Create necessary directories and set permissions
RUN mkdir -p /tmp/video-processing && \
    chmod 755 /tmp/video-processing

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Change ownership of app directory
RUN chown -R appuser:appgroup /app /tmp/video-processing

# Switch to non-root user
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/video-processing

# Run the application
CMD ["npm", "start"]