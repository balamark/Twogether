use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use bcrypt::BcryptError;
use serde_json::json;
use sqlx::migrate::MigrateError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("驗證錯誤: {0}")]
    Validation(String),

    #[error("認證錯誤: {0}")]
    Auth(String),

    #[error("資源不存在: {0}")]
    NotFound(String),

    #[error("資源衝突: {0}")]
    Conflict(String),

    #[error("請求錯誤: {0}")]
    BadRequest(String),

    #[error("內部錯誤: {0}")]
    Internal(#[from] anyhow::Error),

    #[error("資料庫錯誤: {0}")]
    Database(#[from] sqlx::Error),
}

// Implement From<BcryptError> for AppError
impl From<BcryptError> for AppError {
    fn from(error: BcryptError) -> Self {
        AppError::Internal(anyhow::anyhow!("密碼加密錯誤: {}", error))
    }
}

// Implement From<MigrateError> for AppError
impl From<MigrateError> for AppError {
    fn from(error: MigrateError) -> Self {
        AppError::Internal(anyhow::anyhow!("資料庫遷移錯誤: {}", error))
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_code, error_message) = match self {
            AppError::Validation(msg) => (StatusCode::UNPROCESSABLE_ENTITY, "VALIDATION_ERROR", msg),
            AppError::Auth(msg) => (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg),
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg),
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg),
            AppError::Internal(e) => {
                tracing::error!("Internal error: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "內部錯誤，請稍後再試".to_string(),
                )
            }
            AppError::Database(e) => {
                tracing::error!("Database error: {:?}", e);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "資料庫錯誤，請稍後再試".to_string(),
                )
            }
        };

        let body = Json(json!({
            "error": {
                "code": error_code,
                "message": error_message,
            }
        }));

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>; 