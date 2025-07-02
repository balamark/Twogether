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
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement achievement retrieval
    Ok(Json(serde_json::json!({
        "message": "Achievements system - Coming soon! 成就系統即將推出！",
        "preview_badges": [
            "新手情侶 (Beginner Couple)",
            "週間戀人 (Weekly Lovers)", 
            "熱戀情侶 (Passionate Couple)",
            "甜蜜無敵 (Sweet Invincible)"
        ]
    })))
} 