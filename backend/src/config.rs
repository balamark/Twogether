use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub cors_origin: String,
    pub port: u16,
    pub max_file_size: usize,
    pub environment: String,
    pub supabase_url: String,
    pub supabase_anon_key: String,
    pub supabase_service_role_key: String,
    pub resend_api_key: String,
    pub email_from: String,
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    pub smtp_user: Option<String>,
    pub smtp_pass: Option<String>,
    pub smtp_secure: Option<String>,
}

impl Config {
    pub fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        let environment = env::var("ENVIRONMENT")
            .unwrap_or_else(|_| "development".to_string());
            
        // DATABASE_URL must be set (Supabase PostgreSQL)
        let database_url = env::var("DATABASE_URL")
            .unwrap_or_else(|_| {
                panic!("DATABASE_URL must be set. Please configure your Supabase PostgreSQL connection string.")
            });
        
        // Optional SMTP settings (read early to validate email provider requirements)
        let smtp_host = env::var("SMTP_HOST").ok();
        let smtp_port = env::var("SMTP_PORT").ok().and_then(|v| v.parse::<u16>().ok());
        let smtp_user = env::var("SMTP_USER").ok();
        let smtp_pass = env::var("SMTP_PASS").ok();
        let smtp_secure = env::var("SMTP_SECURE").ok();

        // Determine Resend key requirement: allow missing if SMTP creds are present in production
        let resend_api_key = match env::var("RESEND_API_KEY") {
            Ok(v) => v,
            Err(_) => {
                let has_smtp = smtp_host.is_some() && smtp_user.is_some() && smtp_pass.is_some();
                if environment == "production" && !has_smtp {
                    panic!("RESEND_API_KEY or SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) must be set in production");
                }
                // Dev default or SMTP-driven production; allow placeholder
                "dev-resend-api-key".to_string()
            }
        };

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
            resend_api_key,
            email_from: env::var("EMAIL_FROM").unwrap_or_else(|_| {
                if environment == "production" {
                    panic!("EMAIL_FROM must be set in production")
                } else {
                    "Twogether <no-reply@example.com>".to_string()
                }
            }),
            smtp_host,
            smtp_port,
            smtp_user,
            smtp_pass,
            smtp_secure,
        })
    }
    
    pub fn is_production(&self) -> bool {
        self.environment == "production"
    }
    
    pub fn is_development(&self) -> bool {
        self.environment == "development"
    }
} 