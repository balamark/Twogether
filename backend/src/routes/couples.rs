use axum::{
    extract::{Json, State},
    routing::{get, post, put},
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
    #[allow(dead_code)] // Keep for future use
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateCoupleJourneyRequest {
    pub anniversary_date: Option<chrono::NaiveDate>,
    pub first_date: Option<chrono::NaiveDate>,
    pub first_kiss_date: Option<chrono::NaiveDate>,
    pub first_kiss_place: Option<String>,
    pub first_intimacy_place: Option<String>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_couple))
        .route("/", get(get_couple))
        .route("/pairing-code", post(generate_pairing_code))
        .route("/nicknames", put(update_nicknames))
        .route("/journey", put(update_couple_journey))
}

/// Helper function to get a user's couple ID
/// Returns None if user has no couple
pub async fn get_user_couple_id(
    state: &AppState,
    user_id: Uuid,
) -> Result<Option<Uuid>> {
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    Ok(couple.map(|c| c.id))
}

/// Helper function to create a single-user couple
/// Returns the couple ID and optional pairing code
pub async fn create_single_user_couple(
    state: &AppState,
    user_id: Uuid,
    couple_name: Option<String>,
    anniversary_date: Option<chrono::NaiveDate>,
    generate_pairing: bool,
) -> Result<(Uuid, Option<String>)> {
    let couple_id = Uuid::new_v4();
    let now = Utc::now();

    // Create the couple
    sqlx::query!(
        "INSERT INTO couples (id, user1_id, user2_id, couple_name, anniversary_date, created_at) 
         VALUES ($1, $2, NULL, $3, $4, $5)",
        couple_id,
        user_id,
        couple_name,
        anniversary_date,
        now
    )
    .execute(&state.db.pool)
    .await?;

    tracing::debug!("Created new couple {} for user {}", couple_id, user_id);

    // Generate pairing code if requested
    let pairing_code = if generate_pairing {
        let expires_at = now + Duration::hours(24);
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

        tracing::info!("Generated initial pairing code for couple {}", couple_id);
        Some(code)
    } else {
        None
    };

    Ok((couple_id, pairing_code))
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
            let (new_couple_id, _) = create_single_user_couple(&state, user_id, None, None, false).await?;
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

    // Check if user is already in a complete couple (with two users)
    let existing_couple = sqlx::query!(
        "SELECT id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    // Only block if the user is in a complete couple (has both users)
    if let Some(couple) = &existing_couple {
        if couple.user2_id.is_some() {
            tracing::warn!("User {} attempted to create/join couple but already has a complete couple", user_id);
            return Err(AppError::Conflict("您已經有完整的情侶檔案了，無法再次配對。如果您需要重新配對，請先解除當前配對。".to_string()));
        }
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

        // Get the joining user's existing couple (should be single-user)
        let joining_user_couple = sqlx::query!(
            "SELECT id FROM couples WHERE user1_id = $1 AND user2_id IS NULL",
            user_id
        )
        .fetch_optional(&state.db.pool)
        .await?;

        // Start a transaction to merge the couples
        let mut tx = state.db.pool.begin().await?;

        // Update the target couple with the new partner
        sqlx::query!(
            "UPDATE couples SET user2_id = $1 WHERE id = $2",
            user_id,
            pairing_code.couple_id
        )
        .execute(&mut *tx)
        .await?;

        // If the joining user has their own couple, merge their data
        if let Some(joining_couple) = joining_user_couple {
            tracing::info!("Merging couple {} into couple {}", joining_couple.id, pairing_code.couple_id);
            
            // Move love moments from joining user's couple to target couple
            sqlx::query!(
                "UPDATE love_moments SET couple_id = $1 WHERE couple_id = $2",
                pairing_code.couple_id,
                joining_couple.id
            )
            .execute(&mut *tx)
            .await?;

            // Move photos from joining user's couple to target couple
            sqlx::query!(
                "UPDATE photos SET couple_id = $1 WHERE couple_id = $2",
                pairing_code.couple_id,
                joining_couple.id
            )
            .execute(&mut *tx)
            .await?;

            // Move coin transactions from joining user's couple to target couple
            sqlx::query!(
                "UPDATE coin_transactions SET couple_id = $1 WHERE couple_id = $2",
                pairing_code.couple_id,
                joining_couple.id
            )
            .execute(&mut *tx)
            .await?;

            // Move achievements from joining user's couple to target couple
            sqlx::query!(
                "UPDATE achievements SET couple_id = $1 WHERE couple_id = $2",
                pairing_code.couple_id,
                joining_couple.id
            )
            .execute(&mut *tx)
            .await?;

            // Delete the joining user's empty couple
            sqlx::query!(
                "DELETE FROM couples WHERE id = $1",
                joining_couple.id
            )
            .execute(&mut *tx)
            .await?;

            tracing::info!("Successfully merged couple {} into couple {}", joining_couple.id, pairing_code.couple_id);
        }

        // Mark pairing code as used
        sqlx::query!(
            "UPDATE pairing_codes SET used_at = NOW(), used_by = $1 WHERE id = $2",
            user_id,
            pairing_code.id
        )
        .execute(&mut *tx)
        .await?;

        // Commit the transaction
        tx.commit().await?;

        tracing::info!("Successfully paired user {} with couple {}", user_id, pairing_code.couple_id);

        // Get updated couple information including both nicknames
        let updated_couple = sqlx::query!(
            "SELECT c.id, c.couple_name, c.anniversary_date, c.created_at,
                    u1.nickname as user1_nickname, u2.nickname as user2_nickname
             FROM couples c
             JOIN users u1 ON c.user1_id = u1.id
             JOIN users u2 ON c.user2_id = u2.id
             WHERE c.id = $1",
            pairing_code.couple_id
        )
        .fetch_one(&state.db.pool)
        .await?;

        return Ok(Json(CoupleResponse {
            id: updated_couple.id,
            couple_name: updated_couple.couple_name,
            anniversary_date: updated_couple.anniversary_date,
            user1_nickname: updated_couple.user1_nickname,
            user2_nickname: Some(updated_couple.user2_nickname),
            created_at: updated_couple.created_at.unwrap_or_else(|| Utc::now()),
            pairing_code: None,
        }));
    }

    // Create a new single-user couple with pairing code
    let (couple_id, pairing_code) = create_single_user_couple(
        &state,
        user_id,
        payload.couple_name.clone(),
        payload.anniversary_date,
        true
    ).await?;

    Ok(Json(CoupleResponse {
        id: couple_id,
        couple_name: payload.couple_name,
        anniversary_date: payload.anniversary_date,
        user1_nickname: claims.nickname,
        user2_nickname: None,
        created_at: Utc::now(),
        pairing_code,
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
         LEFT JOIN users u2 ON c.user2_id = u2.id
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

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateNicknamesRequest {
    #[validate(length(min = 2, max = 50))]
    pub partner1: Option<String>,
    #[validate(length(min = 2, max = 50))]
    pub partner2: Option<String>,
}

/// Update the authenticated user's nickname within the couple context
/// PUT /api/couples/nicknames
#[axum::debug_handler]
async fn update_nicknames(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<UpdateNicknamesRequest>,
) -> Result<Json<CoupleResponse>> {
    // Validate lengths if provided
    payload.validate().map_err(|e| {
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the couple and determine whether the caller is user1 or user2
    let couple = sqlx::query!(
        "SELECT id, user1_id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    // Determine which field to take based on position; if no couple yet, allow updating self directly using partner1 if provided, otherwise partner2
    let (nickname_to_set, target_user_id) = match couple {
        Some(c) => {
            if c.user1_id == user_id {
                let new_name = payload.partner1.clone().ok_or_else(|| AppError::Validation("請提供要更新的暱稱 (partner1)".to_string()))?;
                (new_name, c.user1_id)
            } else {
                // Caller is user2
                let new_name = payload.partner2.clone().ok_or_else(|| AppError::Validation("請提供要更新的暱稱 (partner2)".to_string()))?;
                (new_name, c.user2_id.expect("user2_id must be Some for user2"))
            }
        }
        None => {
            // No couple found; update own nickname using the first provided value
            let provided = payload.partner1.or(payload.partner2).ok_or_else(|| AppError::Validation("請提供要更新的暱稱".to_string()))?;
            (provided, user_id)
        }
    };

    // Update the user's nickname
    sqlx::query!(
        "UPDATE users SET nickname = $1 WHERE id = $2",
        nickname_to_set,
        target_user_id
    )
    .execute(&state.db.pool)
    .await?;

    // Return updated couple info
    let couple = sqlx::query!(
        "SELECT c.id, c.couple_name, c.anniversary_date, c.created_at, \
                u1.nickname as user1_nickname, u2.nickname as \"user2_nickname?\", \
                pc.code as \"pairing_code?\" \
         FROM couples c \
         JOIN users u1 ON c.user1_id = u1.id \
         LEFT JOIN users u2 ON c.user2_id = u2.id \
         LEFT JOIN pairing_codes pc ON c.id = pc.couple_id  \
            AND pc.used_at IS NULL  \
            AND pc.expires_at > NOW() \
         WHERE c.user1_id = $1 OR c.user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    // If the couple isn't found (single-user or not created), synthesize a minimal response
    if let Some(couple) = couple {
        return Ok(Json(CoupleResponse {
            id: couple.id,
            couple_name: couple.couple_name,
            anniversary_date: couple.anniversary_date,
            user1_nickname: couple.user1_nickname,
            user2_nickname: couple.user2_nickname,
            created_at: couple.created_at.unwrap_or_else(|| Utc::now()),
            pairing_code: couple.pairing_code,
        }));
    }

    // No couple row: return user's own nickname with placeholders
    let user = sqlx::query!(
        "SELECT id, nickname, created_at FROM users WHERE id = $1",
        user_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(CoupleResponse {
        id: Uuid::new_v4(),
        couple_name: None,
        anniversary_date: None,
        user1_nickname: user.nickname,
        user2_nickname: None,
        created_at: user.created_at.unwrap_or_else(|| Utc::now()),
        pairing_code: None,
    }))
}

/// Update couple journey fields (anniversary and milestone places)
/// PUT /api/couples/journey
#[axum::debug_handler]
async fn update_couple_journey(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<UpdateCoupleJourneyRequest>,
) -> Result<Json<CoupleResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find couple id
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    let couple_id = match couple { Some(c) => c.id, None => {
        return Err(AppError::NotFound("找不到情侶檔案".to_string()));
    } };

    // Update provided fields only
    sqlx::query!(
        "UPDATE couples SET 
            anniversary_date = COALESCE($2, anniversary_date),
            first_date = COALESCE($3, first_date),
            first_kiss_date = COALESCE($4, first_kiss_date),
            first_kiss_place = COALESCE($5, first_kiss_place),
            first_intimacy_place = COALESCE($6, first_intimacy_place)
         WHERE id = $1",
        couple_id,
        payload.anniversary_date,
        payload.first_date,
        payload.first_kiss_date,
        payload.first_kiss_place,
        payload.first_intimacy_place
    )
    .execute(&state.db.pool)
    .await?;

    // Return updated couple
    let couple = sqlx::query!(
        "SELECT c.id, c.couple_name, c.anniversary_date, c.created_at, \
                u1.nickname as user1_nickname, u2.nickname as \"user2_nickname?\", \
                pc.code as \"pairing_code?\" \
         FROM couples c \
         JOIN users u1 ON c.user1_id = u1.id \
         LEFT JOIN users u2 ON c.user2_id = u2.id \
         LEFT JOIN pairing_codes pc ON c.id = pc.couple_id  \
            AND pc.used_at IS NULL  \
            AND pc.expires_at > NOW() \
         WHERE c.id = $1",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?;

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