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
    services::email::EmailClient,
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
    pub email_client: Arc<EmailClient>,
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
    // Fallback: also try loading ../.env (repo root) when running from backend/
    let _ = dotenvy::from_path("../.env");
    let config = Config::from_env()?;
    // Pretty-print the full configuration at debug level
    tracing::debug!("Loaded configuration (full): {:#?}", config);

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

    // Initialize Email client (SMTP first, fallback to Resend)
    let email_client = if let (Some(host), Some(user), Some(pass)) = (
        config.smtp_host.clone(),
        config.smtp_user.clone(),
        config.smtp_pass.clone(),
    ) {
        let port = config.smtp_port.unwrap_or(587);
        let secure = crate::services::email::SmtpSecurity::from_env(config.smtp_secure.clone());
        tracing::info!("Email client: using SMTP transport ({}:{})", host, port);
        EmailClient::new_smtp(host, port, user, pass, secure, config.email_from.clone())
    } else {
        tracing::info!("Email client: using Resend API");
        EmailClient::new_resend(config.resend_api_key.clone(), config.email_from.clone())
    };

    // Create app state
    let state = AppState {
        config: Arc::new(config.clone()),
        db: Arc::new(db),
        supabase_storage: Arc::new(supabase_storage),
        email_client: Arc::new(email_client),
    };

    // Configure CORS
    // Note: `Access-Control-Allow-Credentials: true` cannot be combined with `Access-Control-Allow-Origin: *`
    // so we only enable credentials when the configured origin is not "*".
    let cors = {
        let origin_str = config.cors_origin.clone();
        let base = CorsLayer::new()
            .allow_origin(origin_str.parse::<HeaderValue>()?)
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
            ]);
        if origin_str == "*" {
            base
        } else {
            base.allow_credentials(true)
        }
    };

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