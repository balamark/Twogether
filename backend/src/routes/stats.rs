use axum::{
    extract::State,
    response::Json,
    routing::get,
    Router,
};

use crate::{
    error::Result,
    models::Claims,
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_stats))
}

/// Get intimacy statistics
/// GET /api/stats
async fn get_stats(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement statistics
    Ok(Json(serde_json::json!({
        "message": "Statistics - Coming soon! 統計功能即將推出！"
    })))
} 