use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub upload_path: String,
    pub cors_origin: String,
    pub port: u16,
    pub max_file_size: usize,
    pub environment: String,
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_service_role_key: String,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let environment = env::var("ENVIRONMENT")
            .unwrap_or_else(|_| "development".to_string());
            
        // Default to PostgreSQL for development, fallback to SQLite
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| {
                if environment == "production" {
                    // This should be set via environment in production
                    panic!("DATABASE_URL must be set in production")
                } else {
                    // Local development - try PostgreSQL first, fallback to SQLite
                    "postgresql://twogether:twogether_dev_password@localhost:5432/twogether_dev".to_string()
                }
            });
            
        Ok(Config {
            database_url,
            jwt_secret: env::var("JWT_SECRET")
                .unwrap_or_else(|_| {
                    if environment == "production" {
                        panic!("JWT_SECRET must be set in production")
                    } else {
                        "twogether-dev-secret-key-change-in-production".to_string()
                    }
                }),
            upload_path: env::var("UPLOAD_PATH")
                .unwrap_or_else(|_| "./uploads".to_string()),
            cors_origin: env::var("CORS_ORIGIN")
                .unwrap_or_else(|_| "http://localhost:5174".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()
                .unwrap_or(8080),
            max_file_size: env::var("MAX_FILE_SIZE")
                .unwrap_or_else(|_| "10485760".to_string()) // 10MB default
                .parse()
                .unwrap_or(10 * 1024 * 1024),
            environment: environment.clone(),
            supabase_url: env::var("SUPABASE_URL")
                .unwrap_or_else(|_| {
                    if environment == "production" {
                        panic!("SUPABASE_URL must be set in production")
                    } else {
                        "https://your-project.supabase.co".to_string()
                    }
                }),
            supabase_anon_key: env::var("SUPABASE_ANON_KEY")
                .unwrap_or_else(|_| {
                    if environment == "production" {
                        panic!("SUPABASE_ANON_KEY must be set in production")
                    } else {
                        "your-anon-key".to_string()
                    }
                }),
            supabase_service_role_key: env::var("SUPABASE_SERVICE_ROLE_KEY")
                .unwrap_or_else(|_| {
                    if environment == "production" {
                        panic!("SUPABASE_SERVICE_ROLE_KEY must be set in production")
                    } else {
                        "your-service-role-key".to_string()
                    }
                }),
        })
    }
    
    pub fn is_production(&self) -> bool {
        self.environment == "production"
    }
    
    pub fn is_development(&self) -> bool {
        self.environment == "development"
    }
} 