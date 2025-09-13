pub mod config;
pub mod database;
pub mod error;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod services;

use std::sync::Arc;

use crate::{config::Config, database::Database, services::supabase::SupabaseStorage, services::email::EmailClient};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Database>,
    pub config: Arc<Config>,
    pub supabase_storage: Arc<SupabaseStorage>,
    pub email_client: Arc<EmailClient>,
} 