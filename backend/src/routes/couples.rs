use axum::{
    extract::{Json, State},
    routing::{get, post},
    Router,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, Result},
    models::Claims,
    AppState,
};

#[derive(Debug, Deserialize, Validate)]
pub struct CreateCoupleRequest {
    #[validate(length(min = 1, max = 100))]
    pub couple_name: Option<String>,
    pub anniversary_date: Option<chrono::NaiveDate>,
    pub partner_email: Option<String>,
    pub pairing_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CoupleResponse {
    pub id: Uuid,
    pub couple_name: Option<String>,
    pub anniversary_date: Option<chrono::NaiveDate>,
    pub user1_nickname: String,
    pub user2_nickname: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
    pub pairing_code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PairingCodeResponse {
    pub code: String,
    pub expires_at: chrono::DateTime<Utc>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_couple))
        .route("/", get(get_couple))
        .route("/pairing-code", post(generate_pairing_code))
}

/// Generate a new pairing code
/// POST /api/couples/pairing-code
#[axum::debug_handler]
async fn generate_pairing_code(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<PairingCodeResponse>> {
    tracing::info!("Pairing code generation request from user {}", claims.sub);
    
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT c.id, c.user2_id, 
            CASE 
                WHEN pc.id IS NOT NULL THEN pc.id 
                ELSE NULL 
            END as existing_code_id
         FROM couples c
         LEFT JOIN pairing_codes pc ON c.id = pc.couple_id 
            AND pc.used_at IS NULL 
            AND pc.expires_at > NOW()
         WHERE c.user1_id = $1 OR c.user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    let couple_id = match couple {
        Some(c) => {
            tracing::debug!("Found existing couple {} for user {}", c.id, user_id);
            
            // Check if couple already has two users
            if let Some(_) = c.user2_id {
                tracing::warn!(
                    user_id = %user_id,
                    couple_id = %c.id,
                    "User attempted to generate code for complete couple"
                );
                return Err(AppError::Conflict(
                    "您的情侶檔案已經有兩個用戶了，無法生成配對碼。如果您需要重新配對，請先解除當前配對。".to_string()
                ));
            }

            // Check if there's an existing valid code
            if let Some(_) = c.existing_code_id {
                tracing::warn!(
                    user_id = %user_id,
                    couple_id = %c.id,
                    "User attempted to generate code but has existing valid code"
                );
                return Err(AppError::Conflict(
                    "您已有一個有效的配對碼，請等待其過期後再生成新的配對碼。配對碼有效期為24小時。".to_string()
                ));
            }

            c.id
        },
        None => {
            tracing::info!(
                user_id = %user_id,
                "User has no couple, creating new single-user couple for pairing code generation"
            );
            
            // Create a new single-user couple
            let new_couple_id = Uuid::new_v4();
            let now = Utc::now();

            sqlx::query!(
                "INSERT INTO couples (id, user1_id, user2_id, couple_name, anniversary_date, created_at) 
                 VALUES ($1, $2, NULL, NULL, NULL, $3)",
                new_couple_id,
                user_id,
                now
            )
            .execute(&state.db.pool)
            .await?;

            tracing::info!("Created new couple {} for user {} to generate pairing code", new_couple_id, user_id);

            new_couple_id
        }
    };

    // Generate a new pairing code
    let expires_at = Utc::now() + Duration::hours(24);
    let code = sqlx::query_scalar!(
        "INSERT INTO pairing_codes (code, couple_id, created_by, expires_at)
         VALUES (generate_pairing_code(), $1, $2, $3)
         RETURNING code",
        couple_id,
        user_id,
        expires_at
    )
    .fetch_one(&state.db.pool)
    .await?;

    tracing::info!(
        user_id = %user_id,
        couple_id = %couple_id,
        expires_at = %expires_at,
        "Generated new pairing code"
    );

    Ok(Json(PairingCodeResponse {
        code,
        expires_at,
    }))
}

/// Create or join a couple
/// POST /api/couples
#[axum::debug_handler]
async fn create_couple(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<CreateCoupleRequest>,
) -> Result<Json<CoupleResponse>> {
    tracing::info!("Create/join couple request from user: {}", claims.sub);
    
    // Validate input
    payload.validate().map_err(|e| {
        tracing::warn!("Couple creation validation failed: {:?}", e);
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Check if user is already in a couple
    let existing_couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    if existing_couple.is_some() {
        tracing::warn!("User {} attempted to create/join couple but already has one", user_id);
        return Err(AppError::Conflict("您已經有情侶檔案了".to_string()));
    }

    // Handle pairing code if provided
    if let Some(code) = payload.pairing_code {
        tracing::info!("User {} attempting to join couple with pairing code: {}", user_id, code);
        
        // Find valid pairing code
        let pairing_code = sqlx::query!(
            "SELECT pc.id, pc.couple_id, pc.created_by, c.user1_id, c.user2_id, c.couple_name, c.anniversary_date, c.created_at, u.nickname as user1_nickname
             FROM pairing_codes pc
             JOIN couples c ON pc.couple_id = c.id
             JOIN users u ON c.user1_id = u.id
             WHERE pc.code = $1 
             AND pc.expires_at > NOW() 
             AND pc.used_at IS NULL",
            code
        )
        .fetch_optional(&state.db.pool)
        .await?;

        let pairing_code = match pairing_code {
            Some(pc) => {
                tracing::debug!("Found valid pairing code for couple: {}", pc.couple_id);
                pc
            },
            None => {
                tracing::warn!("Invalid or expired pairing code attempted: {}", code);
                return Err(AppError::NotFound("配對碼無效或已過期".to_string()));
            }
        };

        // Check if the code was created by the same user
        if pairing_code.created_by == user_id {
            tracing::warn!("User {} attempted to use their own pairing code", user_id);
            return Err(AppError::Conflict("無法使用自己生成的配對碼進行配對".to_string()));
        }

        // Check if couple already has two users
        if pairing_code.user2_id.is_some() {
            tracing::warn!("Attempted to join couple {} that already has two users", pairing_code.couple_id);
            return Err(AppError::Conflict("此情侶檔案已經有兩個用戶了".to_string()));
        }

        // Update the couple with the new partner
        sqlx::query!(
            "UPDATE couples SET user2_id = $1 WHERE id = $2",
            user_id,
            pairing_code.couple_id
        )
        .execute(&state.db.pool)
        .await?;

        tracing::info!("Successfully added user {} as partner to couple {}", user_id, pairing_code.couple_id);

        // Mark pairing code as used
        sqlx::query!(
            "UPDATE pairing_codes SET used_at = NOW(), used_by = $1 WHERE id = $2",
            user_id,
            pairing_code.id
        )
        .execute(&state.db.pool)
        .await?;

        tracing::debug!("Marked pairing code {} as used", pairing_code.id);

        return Ok(Json(CoupleResponse {
            id: pairing_code.couple_id,
            couple_name: pairing_code.couple_name,
            anniversary_date: pairing_code.anniversary_date,
            user1_nickname: pairing_code.user1_nickname,
            user2_nickname: Some(claims.nickname),
            created_at: pairing_code.created_at.unwrap_or_else(|| Utc::now()),
            pairing_code: None,
        }));
    }

    tracing::info!("Creating new couple for user {}", user_id);

    // Create a new single-user couple
    let couple_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query!(
        "INSERT INTO couples (id, user1_id, user2_id, couple_name, anniversary_date, created_at) 
         VALUES ($1, $2, NULL, $3, $4, $5)",
        couple_id,
        user_id,
        payload.couple_name,
        payload.anniversary_date,
        now
    )
    .execute(&state.db.pool)
    .await?;

    tracing::debug!("Created new couple {} for user {}", couple_id, user_id);

    // Generate initial pairing code
    let expires_at = now + Duration::hours(24);
    let pairing_code = sqlx::query_scalar!(
        "INSERT INTO pairing_codes (code, couple_id, created_by, expires_at)
         VALUES (generate_pairing_code(), $1, $2, $3)
         RETURNING code",
        couple_id,
        user_id,
        expires_at
    )
    .fetch_one(&state.db.pool)
    .await?;

    tracing::info!("Generated initial pairing code for couple {}", couple_id);

    Ok(Json(CoupleResponse {
        id: couple_id,
        couple_name: payload.couple_name,
        anniversary_date: payload.anniversary_date,
        user1_nickname: claims.nickname,
        user2_nickname: None,
        created_at: now,
        pairing_code: Some(pairing_code),
    }))
}

/// Get couple information
/// GET /api/couples
#[axum::debug_handler]
async fn get_couple(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<CoupleResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let couple = sqlx::query!(
        "SELECT c.id, c.couple_name, c.anniversary_date, c.created_at, 
                u1.nickname as user1_nickname, u2.nickname as \"user2_nickname?\",
                pc.code as \"pairing_code?\"
         FROM couples c
         JOIN users u1 ON c.user1_id = u1.id
         LEFT JOIN users u2 ON c.user2_id = u2.id AND c.user1_id != c.user2_id
         LEFT JOIN pairing_codes pc ON c.id = pc.couple_id 
            AND pc.used_at IS NULL 
            AND pc.expires_at > NOW()
         WHERE c.user1_id = $1 OR c.user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("找不到情侶檔案".to_string()))?;

    Ok(Json(CoupleResponse {
        id: couple.id,
        couple_name: couple.couple_name,
        anniversary_date: couple.anniversary_date,
        user1_nickname: couple.user1_nickname,
        user2_nickname: couple.user2_nickname,
        created_at: couple.created_at.unwrap_or_else(|| Utc::now()),
        pairing_code: couple.pairing_code,
    }))
} 