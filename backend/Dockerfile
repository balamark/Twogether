# Multi-stage build for Rust backend
FROM rust:1.75-slim as builder

# Install required dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Create app directory
WORKDIR /app

# Copy workspace cargo files
COPY Cargo.toml Cargo.lock ./
COPY backend/Cargo.toml ./backend/Cargo.toml

# Copy source code
COPY backend/src ./backend/src
COPY backend/migrations ./backend/migrations
COPY backend/.sqlx ./backend/.sqlx

# Build the application with SQLx offline mode
ENV SQLX_OFFLINE=true
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

# Create uploads directory
RUN mkdir -p /app/uploads && chown -R appuser:appuser /app

# Switch to app user
USER appuser

# Expose port
EXPOSE 8080

# Set environment variables
ENV ENVIRONMENT=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["./twogether-backend"] 