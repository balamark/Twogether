use axum::{
    extract::State,
    response::Json,
    routing::{get, post},
    Router,
};

use crate::{
    error::Result,
    models::Claims,
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_couple))
        .route("/", get(get_couple))
}

/// Create or join a couple
/// POST /api/couples
async fn create_couple(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement couple creation/joining
    Ok(Json(serde_json::json!({
        "message": "Couple creation - Coming soon! 創建情侶檔案即將推出！"
    })))
}

/// Get couple information
/// GET /api/couples
async fn get_couple(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement couple retrieval
    Ok(Json(serde_json::json!({
        "message": "Couple management - Coming soon! 情侶檔案即將推出！"
    })))
} 