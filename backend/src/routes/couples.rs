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

/// Create a couple relationship
/// POST /api/couples
async fn create_couple(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement couple creation
    Ok(Json(serde_json::json!({
        "message": "Couple creation - Coming soon! 即將推出情侶配對功能！"
    })))
}

/// Get couple information
/// GET /api/couples
async fn get_couple(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement get couple info
    Ok(Json(serde_json::json!({
        "message": "Couple info retrieval - Coming soon!"
    })))
} 