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
        .route("/", get(get_achievements))
}

/// Get achievements for the couple
/// GET /api/achievements
async fn get_achievements(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement achievement system
    Ok(Json(serde_json::json!({
        "message": "Achievement system - Coming soon! 成就系統即將推出！"
    })))
} 