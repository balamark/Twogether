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
        .route("/balance", get(get_balance))
        .route("/transactions", get(get_coin_transactions))
        .route("/transaction", post(create_transaction))
}

/// Get coin balance for the couple
/// GET /api/coins/balance
async fn get_balance(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement coin balance retrieval
    Ok(Json(serde_json::json!({
        "balance": 0,
        "message": "Coin system - Coming soon! 金幣系統即將推出！"
    })))
}

/// Get coin transaction history
/// GET /api/coins/transactions
async fn get_coin_transactions(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement transaction history
    Ok(Json(serde_json::json!({
        "message": "Coin transactions - Coming soon!"
    })))
}

/// Record a coin transaction
/// POST /api/coins/transaction
async fn create_transaction(
    State(_state): State<AppState>,
    _claims: Claims,
) -> Result<Json<serde_json::Value>> {
    // TODO: Implement coin transactions
    Ok(Json(serde_json::json!({
        "message": "Coin transactions - Coming soon! 金幣交易即將推出！"
    })))
} 