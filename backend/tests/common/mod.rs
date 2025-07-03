use axum::{
    http::{header::CONTENT_TYPE, HeaderValue, Method},
    middleware::from_fn_with_state,
    routing::get,
    Router,
};
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::net::SocketAddr;
use std::sync::Once;
use tower_http::cors::CorsLayer;
use twogether_backend::{
    AppState, 
    config::Config, 
    database::Database, 
    services::supabase::SupabaseStorage,
    middleware::{auth, logging},
    routes::{auth_routes, couple_routes, love_moment_routes, achievement_routes, photo_routes, coin_routes, stats_routes},
};

static INIT: Once = Once::new();

pub struct TestApp {
    pub router: Router,
    pub db: PgPool,
}

pub async fn setup_test_app() -> TestApp {
    INIT.call_once(|| {
        dotenvy::dotenv().ok();
        tracing_subscriber::fmt::init();
    });

    // Use test database
    let database_url = std::env::var("TEST_DATABASE_URL")
        .unwrap_or_else(|_| "postgresql://twogether:twogether_dev_password@localhost:5432/twogether_test".to_string());
    
    let db = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("Failed to connect to test database");
    
    // Run migrations
    sqlx::migrate!("../migrations")
        .run(&db)
        .await
        .expect("Failed to run migrations");
    
    // Clear data for clean test state
    clear_test_data(&db).await;
    
    // Create app state
    let config = Config::from_env().expect("Failed to load config");
    let database = Database { pool: db.clone() };
    let supabase_storage = SupabaseStorage::new(
        &config.supabase_url,
        &config.supabase_service_role_key,
    );
    
    let state = AppState {
        config: config.clone(),
        db: database,
        supabase_storage,
    };
    
    // Configure CORS
    let cors = CorsLayer::new()
        .allow_origin(config.cors_origin.parse::<HeaderValue>().unwrap())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([
            CONTENT_TYPE,
            "authorization".parse::<axum::http::HeaderName>().unwrap(),
            "x-requested-with".parse::<axum::http::HeaderName>().unwrap(),
        ])
        .allow_credentials(true);

    // Build application router
    let router = Router::new()
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
    
    TestApp { router, db }
}

async fn root() -> &'static str {
    "Twogether API - Bringing couples closer, one moment at a time! 💝"
}

async fn health_check() -> &'static str {
    "💖 Twogether API is healthy and ready to help couples connect!"
}

async fn clear_test_data(db: &PgPool) {
    // Clear test data in reverse dependency order
    sqlx::query!("DELETE FROM pairing_codes WHERE 1=1")
        .execute(db)
        .await
        .expect("Failed to clear pairing codes");
    
    sqlx::query!("DELETE FROM love_moments WHERE 1=1")
        .execute(db)
        .await
        .expect("Failed to clear love moments");
    
    sqlx::query!("DELETE FROM couples WHERE 1=1")
        .execute(db)
        .await
        .expect("Failed to clear couples");
    
    sqlx::query!("DELETE FROM users WHERE 1=1")
        .execute(db)
        .await
        .expect("Failed to clear users");
} 