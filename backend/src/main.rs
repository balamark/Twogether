mod config;
mod database;
mod models;
mod routes;
mod services;
mod middleware;
mod error;

use axum::{
    http::{header::CONTENT_TYPE, HeaderValue, Method},
    middleware::from_fn_with_state,
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{fmt, EnvFilter, prelude::*};

use crate::{
    config::Config,
    database::Database,
    middleware::{auth, logging},
    routes::{auth_routes, couple_routes, love_moment_routes, achievement_routes, photo_routes, coin_routes, stats_routes},
    services::supabase::SupabaseStorage,
};

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub config: Config,
    pub supabase_storage: SupabaseStorage,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize logging with pretty format and colors
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("twogether_backend=debug,tower_http=debug"));

    tracing_subscriber::registry()
        .with(fmt::layer()
            .with_target(true)
            .with_thread_ids(true)
            .with_line_number(true)
            .with_file(true)
            .with_level(true)
            .with_ansi(true)
            .with_thread_names(true)
            .pretty())
        .with(env_filter)
        .init();

    tracing::info!("Starting Twogether backend server...");

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;
    tracing::debug!("Loaded configuration: {:?}", config);

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    db.migrate().await?;
    tracing::info!("Database connection established");

    // Initialize Supabase storage
    let supabase_storage = SupabaseStorage::new(
        &config.supabase_url,
        &config.supabase_service_role_key,
    );
    tracing::info!("Supabase storage initialized");

    // Create app state
    let state = AppState {
        config: config.clone(),
        db,
        supabase_storage,
    };

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
        .allow_headers([
            CONTENT_TYPE,
            "authorization".parse::<axum::http::HeaderName>()?,
            "x-requested-with".parse::<axum::http::HeaderName>()?,
        ])
        .allow_credentials(true);

    // Build application router
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health_check))
        .nest("/api/auth", auth_routes())
        .nest(
            "/api/couples", 
            couple_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .nest(
            "/api/love-moments", 
            love_moment_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .nest(
            "/api/achievements", 
            achievement_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .nest(
            "/api/photos", 
            photo_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .nest(
            "/api/coins", 
            coin_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .nest(
            "/api/stats", 
            stats_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .layer(cors)
        .layer(logging::create_trace_layer())
        .layer(from_fn_with_state(state.clone(), logging::log_request))
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Server listening on {}", addr);

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