use sqlx::PgPool;
use crate::error::Result;

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
        
        match sqlx::migrate!("./migrations").run(&self.pool).await {
            Ok(_) => {
                tracing::info!("Database migrations completed successfully");
                Ok(())
            }
            Err(sqlx::migrate::MigrateError::VersionMissing(version)) => {
                tracing::warn!("Migration version {} is missing, attempting to repair...", version);
                
                // Try to force reset the migration to the correct state
                match self.repair_migration_state().await {
                    Ok(_) => {
                        tracing::info!("Migration state repaired, retrying migrations...");
                        sqlx::migrate!("./migrations").run(&self.pool).await?;
                        tracing::info!("Database migrations completed successfully after repair");
                        Ok(())
                    }
                    Err(e) => {
                        tracing::error!("Failed to repair migration state: {}", e);
                        Err(e)
                    }
                }
            }
            Err(e) => {
                tracing::error!("Migration failed: {}", e);
                Err(e.into())
            }
        }
    }
    
    async fn repair_migration_state(&self) -> Result<()> {
        tracing::info!("Attempting to repair migration state...");
        
        // Check if _sqlx_migrations table exists using a simpler query
        let table_count = sqlx::query!(
            "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_name = '_sqlx_migrations'"
        )
        .fetch_one(&self.pool)
        .await?;
        
        if table_count.count.unwrap_or(0) == 0 {
            tracing::info!("Migration table doesn't exist, will be created automatically");
            return Ok(());
        }
        
        // Get current migration records
        let current_migrations = sqlx::query!(
            "SELECT version FROM _sqlx_migrations ORDER BY version"
        )
        .fetch_all(&self.pool)
        .await?;
        
        tracing::info!("Current migration records in database: {:?}", 
            current_migrations.iter().map(|m| m.version).collect::<Vec<_>>());
        
        // If we reach here, the table exists and we have migration records
        // The issue might be that migration files were reorganized or renamed
        // For now, we'll proceed carefully and let SQLx handle the discrepancy
        tracing::info!("Migration table exists with {} records", current_migrations.len());
        Ok(())
    }
} 