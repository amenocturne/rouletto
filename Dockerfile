FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source files
COPY . .

# Build the client
RUN bun run build

# Production stage
FROM oven/bun:1-slim AS production
WORKDIR /app

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs bunjs

# Copy only necessary files from builder
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/src ./src

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Switch to non-root user
USER bunjs

# Expose port
EXPOSE 3000

# Start the server
CMD ["bun", "run", "start"]
