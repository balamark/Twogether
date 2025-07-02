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
        .route("/", post(upload_photo))
        .route("/", get(get_photos))
}

/// Upload a photo memory
/// POST /api/photos
async fn upload_photo(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement photo upload
    Ok(Json(serde_json::json!({
        "message": "Photo upload - Coming soon! 照片上傳功能即將推出！"
    })))
}

/// Get photos for the couple
/// GET /api/photos
async fn get_photos(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement photo retrieval
    Ok(Json(serde_json::json!({
        "message": "Photo memories - Coming soon! 回憶相簿即將推出！"
    })))
} 