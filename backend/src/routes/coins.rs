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
        .route("/balance", get(get_coin_balance))
        .route("/transactions", get(get_coin_transactions))
}

/// Get coin balance for the couple
/// GET /api/coins/balance
async fn get_coin_balance(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement coin balance retrieval
    Ok(Json(serde_json::json!({
        "message": "Coin system - Coming soon! 金幣系統即將推出！",
        "preview": {
            "earn_love_moment": "+100 coins",
            "earn_new_script": "+300 coins", 
            "earn_achievement": "+1000 coins",
            "unlock_premium": "-2000 coins"
        }
    })))
}

/// Get coin transaction history
/// GET /api/coins/transactions
async fn get_coin_transactions(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement transaction history
    Ok(Json(serde_json::json!({
        "message": "Coin transactions - Coming soon!"
    })))
} 