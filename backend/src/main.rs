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
use error::AppError;
use clap::Parser;
use std::net::SocketAddr;
use std::fs;
use std::path::Path;
use std::sync::OnceLock;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{fmt, EnvFilter, prelude::*};
use std::sync::Arc;

use crate::{
    config::Config,
    database::Database,
    middleware::{auth, logging},
    routes::{auth_routes, couple_routes, love_moment_routes, achievement_routes, photo_routes, coin_routes, stats_routes, intimacy_request_routes},
    services::supabase::SupabaseStorage,
};

// Global guard to keep the file logging alive
static LOG_GUARD: OnceLock<Option<tracing_appender::non_blocking::WorkerGuard>> = OnceLock::new();

#[derive(Parser)]
#[command(name = "twogether-backend")]
#[command(about = "Twogether backend server for couples relationship tracking")]
struct Cli {
    /// Enable file logging and specify the log file path
    #[arg(long, value_name = "FILE")]
    log_file: Option<String>,
    
    /// Set the log level (trace, debug, info, warn, error)
    #[arg(long, default_value = "info")]
    log_level: String,
}

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub config: Arc<Config>,
    pub supabase_storage: Arc<SupabaseStorage>,
}

#[tokio::main]
async fn main() -> Result<(), AppError> {
    // Parse command line arguments
    let cli = Cli::parse();
    
    // Create logs directory if logging to file and directory doesn't exist
    if let Some(ref log_file_path) = cli.log_file {
        if let Some(parent_dir) = Path::new(log_file_path).parent() {
            fs::create_dir_all(parent_dir)?;
        }
    }

    // Configure logging based on CLI arguments
    let env_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new(&format!("twogether_backend={},tower_http=debug", cli.log_level)));

    if let Some(log_file_path) = cli.log_file {
        // Dual logging: both console and file
        // Resolve path relative to project root (one level up from backend)
        let project_root = std::env::current_dir()
            .expect("Failed to get current directory")
            .parent()
            .expect("Failed to get parent directory")
            .to_path_buf();
        let full_log_path = project_root.join(&log_file_path);
        let log_dir = full_log_path.parent().expect("Log file must have a parent directory");
        let log_filename = full_log_path.file_name().expect("Log file must have a filename");
        
        let file_appender = tracing_appender::rolling::never(log_dir, log_filename);
        let (non_blocking_file, guard) = tracing_appender::non_blocking(file_appender);
        
        tracing_subscriber::registry()
            .with(fmt::layer()
                .with_target(true)
                .with_thread_ids(true)
                .with_line_number(true)
                .with_file(true)
                .with_level(true)
                .with_ansi(true) // Colors for console
                .with_thread_names(true)
                .pretty())
            .with(fmt::layer()
                .with_target(true)
                .with_thread_ids(true)
                .with_line_number(true)
                .with_file(true)
                .with_level(true)
                .with_ansi(false) // No colors for file
                .with_thread_names(true)
                .with_writer(non_blocking_file))
            .with(env_filter)
            .init();
        
        tracing::info!("Dual logging enabled - Console + File: {}", full_log_path.display());
        // Store the guard globally to keep it alive
        LOG_GUARD.set(Some(guard)).expect("Failed to set log guard");
    } else {
        // Console logging only (default)
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
        // Set empty guard for console logging
        LOG_GUARD.set(None).expect("Failed to set log guard");
    };

    tracing::info!("Starting Twogether backend server...");

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;
    tracing::debug!("Loaded configuration: {:?}", config);

    // Initialize database with retry logic
    let db = match Database::new(&config.database_url).await {
        Ok(db) => {
            match db.migrate().await {
                Ok(_) => {
                    tracing::info!("Database connection established and migrations completed");
                    db
                }
                Err(e) => {
                    tracing::error!("Database migration failed: {}", e);
                    tracing::warn!("Continuing without database migrations - some features may not work");
                    db
                }
            }
        }
        Err(e) => {
            tracing::error!("Failed to connect to database: {}", e);
            return Err(e);
        }
    };

    // Initialize Supabase storage
    let supabase_storage = SupabaseStorage::new(
        &config.supabase_url,
        &config.supabase_service_role_key,
    );
    tracing::info!("Supabase storage initialized");

    // Create app state
    let state = AppState {
        config: Arc::new(config.clone()),
        db: Arc::new(db),
        supabase_storage: Arc::new(supabase_storage),
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
        .nest(
            "/api/intimacy", 
            intimacy_request_routes().layer(from_fn_with_state(state.clone(), auth::require_auth))
        )
        .layer(cors)
        .layer(logging::create_trace_layer())
        .layer(from_fn_with_state(state.clone(), logging::log_request))
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Server listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    
    // Keep the log guard alive until the server shuts down
    let result = axum::serve(listener, app).await;
    
    // Properly handle log guard cleanup
    let _ = LOG_GUARD.get().expect("Log guard not set");
    
    result?;
    Ok(())
}

async fn root() -> &'static str {
    "Twogether API - Bringing couples closer, one moment at a time! 💝"
}

async fn health_check() -> &'static str {
    "💖 Twogether API is healthy and ready to help couples connect!"
} 