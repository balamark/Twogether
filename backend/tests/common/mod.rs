use axum::Router;
use sqlx::{PgPool, postgres::PgPoolOptions};
use std::sync::Once;
use twogether_backend::{AppState, config::Config, database::Database, services::supabase::SupabaseStorage};

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
        config,
        db: database,
        supabase_storage,
    };
    
    // Build router with all routes
    let router = twogether_backend::create_router(state);
    
    TestApp { router, db }
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