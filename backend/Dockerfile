# Multi-stage build for Rust backend
FROM rust:latest AS builder

# Install required dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Set SQLx to use offline mode
ENV SQLX_OFFLINE=true

# Copy workspace cargo files
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml ./backend/Cargo.toml

# Copy source code and SQLx metadata
COPY backend/src ./backend/src
COPY backend/migrations ./backend/migrations
COPY ./backend/.sqlx/ ./backend/.sqlx/

# Build the application (will use SQLx offline mode)
RUN cd backend && cargo build --release

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libpq5 \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create app user
RUN useradd -ms /bin/bash appuser

# Create app directory
WORKDIR /app

# Copy the binary from builder stage
COPY --from=builder /app/target/release/twogether-backend /app/twogether-backend

# Copy migrations
COPY --from=builder /app/backend/migrations /app/migrations

# Switch to app user
USER appuser

# Expose port
EXPOSE 8080

# Set environment variables
ENV ENVIRONMENT=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Health check with longer timeout for startup
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["./twogether-backend"] 