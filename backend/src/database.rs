use sqlx::{PgPool, Pool, Postgres};
use crate::error::{AppError, Result};

#[derive(Clone)]
pub struct Database {
    pub pool: PgPool,
}

impl Database {
    pub async fn new(database_url: &str) -> Result<Self> {
        tracing::info!("Connecting to PostgreSQL database: {}", database_url);
        
        let pool = PgPool::connect(database_url).await?;
        
        Ok(Database { pool })
    }

    pub async fn migrate(&self) -> Result<()> {
        tracing::info!("Running database migrations...");
        sqlx::migrate!("./migrations").run(&self.pool).await?;
        tracing::info!("Database migrations completed successfully");
        Ok(())
    }
} 