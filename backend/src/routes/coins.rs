use axum::{
    extract::State,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, Result},
    models::Claims,
    AppState,
};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateTransactionRequest {
    #[validate(range(min = 1))]
    pub amount: i32,
    #[validate(length(min = 1, max = 50))]
    pub transaction_type: String,
    #[validate(length(min = 1, max = 200))]
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct CoinBalance {
    pub balance: i64,
    pub total_earned: i64,
    pub total_spent: i64,
    pub last_updated: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CoinTransaction {
    pub id: Uuid,
    pub amount: i32,
    pub transaction_type: String,
    pub description: String,
    pub transaction_date: chrono::DateTime<Utc>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/balance", get(get_balance))
        .route("/transactions", get(get_coin_transactions))
        .route("/transaction", post(create_transaction))
}

/// Get coin balance for the couple
/// GET /api/coins/balance
async fn get_balance(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<CoinBalance>> {
    tracing::debug!("Fetching coin balance for user {}", claims.sub);
    
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    if couple.is_none() {
        tracing::warn!("User {} attempted to fetch coin balance but has no couple", user_id);
        return Err(AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()));
    }

    let couple_id = couple.unwrap().id;
    tracing::debug!("Found couple {} for user {}", couple_id, user_id);

    // Get balance from the view
    let balance_result = sqlx::query!(
        "SELECT balance, last_updated FROM coin_balances WHERE couple_id = $1",
        couple_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    tracing::debug!("Raw balance result for couple {}: {:?}", couple_id, balance_result);

    let balance = balance_result.as_ref().map(|r| r.balance).unwrap_or(Some(0)).unwrap_or(0);
    let last_updated = balance_result.as_ref().map(|r| r.last_updated).unwrap_or_else(|| Some(Utc::now())).unwrap_or_else(|| Utc::now());

    // Get total earned and spent
    let totals = sqlx::query!(
        "SELECT 
            COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE 0 END), 0) as total_earned,
            COALESCE(SUM(CASE WHEN transaction_type = 'spend' THEN amount ELSE 0 END), 0) as total_spent
         FROM coin_transactions 
         WHERE couple_id = $1",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    tracing::debug!(
        "Coin stats for couple {}: balance={}, earned={}, spent={}", 
        couple_id, 
        balance,
        totals.total_earned.unwrap_or(0),
        totals.total_spent.unwrap_or(0)
    );

    Ok(Json(CoinBalance {
        balance,
        total_earned: totals.total_earned.unwrap_or(0),
        total_spent: totals.total_spent.unwrap_or(0),
        last_updated,
    }))
}

/// Get coin transaction history
/// GET /api/coins/transactions
async fn get_coin_transactions(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<CoinTransaction>>> {
    tracing::debug!("Fetching coin transactions for user {}", claims.sub);
    
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    if couple.is_none() {
        tracing::warn!("User {} attempted to fetch coin transactions but has no couple", user_id);
        return Err(AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()));
    }

    let couple_id = couple.unwrap().id;
    tracing::debug!("Found couple {} for user {}", couple_id, user_id);

    // Get transaction history
    let transactions = sqlx::query!(
        "SELECT id, amount, transaction_type, description, transaction_date
         FROM coin_transactions 
         WHERE couple_id = $1
         ORDER BY transaction_date DESC
         LIMIT 50",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    tracing::debug!("Found {} transactions for couple {}", transactions.len(), couple_id);

    let response_transactions: Vec<CoinTransaction> = transactions.into_iter().map(|tx| {
        CoinTransaction {
            id: tx.id,
            amount: tx.amount,
            transaction_type: tx.transaction_type,
            description: tx.description,
            transaction_date: tx.transaction_date.unwrap_or_else(|| Utc::now()),
        }
    }).collect();

    Ok(Json(response_transactions))
}

/// Record a coin transaction
/// POST /api/coins/transaction
async fn create_transaction(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<CreateTransactionRequest>,
) -> Result<Json<CoinTransaction>> {
    // Validate input
    payload.validate().map_err(|e| {
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    // Validate transaction type
    if payload.transaction_type != "earn" && payload.transaction_type != "spend" {
        return Err(AppError::Validation("交易類型必須是 'earn' 或 'spend'".to_string()));
    }

    // For spend transactions, check if user has enough balance
    if payload.transaction_type == "spend" {
        let current_balance = sqlx::query!(
            "SELECT COALESCE(balance, 0) as balance FROM coin_balances WHERE couple_id = $1",
            couple.id
        )
        .fetch_optional(&state.db.pool)
        .await?
        .map(|r| r.balance)
        .unwrap_or(Some(0)).unwrap_or(0);

        if current_balance < payload.amount as i64 {
            return Err(AppError::Validation("餘額不足".to_string()));
        }
    }

    // Create transaction
    let transaction_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query!(
        "INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, description, transaction_date)
         VALUES ($1, $2, $3, $4, $5, $6)",
        transaction_id,
        couple.id,
        payload.amount,
        payload.transaction_type,
        payload.description,
        now
    )
    .execute(&state.db.pool)
    .await?;

    Ok(Json(CoinTransaction {
        id: transaction_id,
        amount: payload.amount,
        transaction_type: payload.transaction_type,
        description: payload.description,
        transaction_date: now,
    }))
} 