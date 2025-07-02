use sqlx::{Any, AnyPool, Sqlite, migrate::MigrateDatabase};
use crate::error::{AppError, Result};

#[derive(Clone)]
pub struct Database {
    pub pool: AnyPool,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        if database_url.starts_with("postgresql://") || database_url.starts_with("postgres://") {
            tracing::info!("Connecting to PostgreSQL database: {}", database_url);
        } else {
            tracing::info!("Connecting to SQLite database: {}", database_url);
            
            // Create database if it doesn't exist (SQLite only)
            if !Sqlite::database_exists(database_url).await? {
                tracing::info!("Creating SQLite database: {}", database_url);
                Sqlite::create_database(database_url).await?;
            }
        }

        let pool = AnyPool::connect(database_url).await?;
        
        // Enable foreign keys for SQLite if it's SQLite
        if database_url.starts_with("sqlite:") {
            sqlx::query("PRAGMA foreign_keys = ON")
                .execute(&pool)
                .await?;
        }

        Ok(Database { pool })
    }

    pub async fn migrate(&self) -> Result<()> {
        tracing::info!("Running database migrations...");
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        tracing::info!("Database migrations completed successfully");
        Ok(())
    }
} 