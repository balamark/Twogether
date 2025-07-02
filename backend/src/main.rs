mod config;
mod database;
mod models;
mod routes;
mod services;
mod middleware;
mod error;

use axum::{
    http::{header::CONTENT_TYPE, HeaderValue, Method},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use crate::{
    config::Config,
    database::Database,
    routes::{auth_routes, couple_routes, love_moment_routes, achievement_routes, photo_routes, coin_routes, stats_routes},
};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "love_time_backend=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    db.migrate().await?;

    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(config.cors_origin.parse::<HeaderValue>()?)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([CONTENT_TYPE])
        .allow_credentials(true);

    // Build application router
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health_check))
        .nest("/api/auth", auth_routes())
        .nest("/api/couples", couple_routes())
        .nest("/api/love-moments", love_moment_routes())
        .nest("/api/achievements", achievement_routes())
        .nest("/api/photos", photo_routes())
        .nest("/api/coins", coin_routes())
        .nest("/api/stats", stats_routes())
        .layer(cors)
        .with_state(AppState { db, config: config.clone() });

    // Start server
    let addr = SocketAddr::from(([127, 0, 0, 1], config.port));
    tracing::info!("Twogether API server starting on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn root() -> &'static str {
    "Twogether API - Bringing couples closer, one moment at a time! 💝"
}

async fn health_check() -> &'static str {
    "💖 Twogether API is healthy and ready to help couples connect!"
}

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
} 