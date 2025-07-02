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

/// Get comprehensive statistics
/// GET /api/stats
async fn get_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement comprehensive stats
    Ok(Json(serde_json::json!({
        "message": "Statistics dashboard - Coming soon! 統計面板即將推出！",
        "features": [
            "愛的頻率統計 (Love frequency stats)",
            "成就進度追蹤 (Achievement progress)", 
            "金幣使用分析 (Coin usage analysis)",
            "回憶時光軸 (Memory timeline)"
        ]
    })))
} 