use axum::{
    extract::State,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use uuid::Uuid;
use validator::Validate;
use anyhow::anyhow;

use crate::{
    error::{AppError, Result},
    models::{AuthResponse, Claims, CreateUserRequest, LoginRequest, User, UserResponse},
    services::auth::{hash_password, verify_password},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/me", get(me))
}

/// Register a new user
/// POST /api/auth/register
async fn register(
    State(state): State<AppState>,
    Json(payload): Json<CreateUserRequest>,
) -> Result<Json<AuthResponse>> {
    tracing::info!("Attempting to register new user with email: {}", payload.email);
    
    // Validate input
    payload.validate().map_err(|e| {
        tracing::warn!("Registration validation failed: {:?}", e);
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    // Check if user already exists
    let existing_user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1"
    )
    .bind(&payload.email)
    .fetch_optional(&state.db.pool)
    .await?;

    if existing_user.is_some() {
        tracing::warn!("Registration failed: Email already exists: {}", payload.email);
        return Err(AppError::Conflict("此電子郵件已被註冊".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&payload.password)?;
    tracing::debug!("Password hashed successfully for new user");

    // Create user
    let user_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO users (id, nickname, email, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(user_id)
    .bind(&payload.nickname)
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(now)
    .execute(&state.db.pool)
    .await?;

    tracing::info!("New user created successfully with ID: {}", user_id);

    // Create JWT token
    let token = create_token(&state, user_id, &payload.nickname)?;
    tracing::debug!("JWT token created for new user");

    // Return response
    let user_response = UserResponse {
        id: user_id,
        nickname: payload.nickname,
        created_at: now,
        last_login: Some(now),
    };

    Ok(Json(AuthResponse {
        token,
        user: user_response,
    }))
}

/// Login user
/// POST /api/auth/login
async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>> {
    tracing::info!("Login attempt for email: {}", payload.email);

    // Find user
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = $1"
    )
    .bind(&payload.email)
    .fetch_optional(&state.db.pool)
    .await?;

    let user = match user {
        Some(user) => {
            tracing::debug!("User found for email: {}", payload.email);
            user
        },
        None => {
            tracing::warn!("Login failed: User not found for email: {}", payload.email);
            return Err(AppError::Auth("電子郵件或密碼錯誤".to_string()));
        }
    };

    // Verify password
    if !verify_password(&payload.password, &user.password_hash)? {
        tracing::warn!("Login failed: Invalid password for email: {}", payload.email);
        return Err(AppError::Auth("電子郵件或密碼錯誤".to_string()));
    }

    tracing::debug!("Password verified successfully for user: {}", user.id);

    // Update last login
    let now = Utc::now();
    sqlx::query!(
        "UPDATE users SET last_login = $1 WHERE id = $2",
        now,
        user.id
    )
    .execute(&state.db.pool)
    .await?;

    // Create JWT token
    let token = create_token(&state, user.id, &user.nickname)?;
    tracing::debug!("JWT token created for user: {}", user.id);

    // Return response
    let user_response = UserResponse {
        id: user.id,
        nickname: user.nickname,
        created_at: user.created_at,
        last_login: Some(now),
    };

    tracing::info!("Login successful for user: {}", user.id);

    Ok(Json(AuthResponse {
        token,
        user: user_response,
    }))
}

/// Get current user
/// GET /api/auth/me
async fn me(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<UserResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::Auth("用戶不存在".to_string()))?;

    Ok(Json(UserResponse {
        id: user.id,
        nickname: user.nickname,
        created_at: user.created_at,
        last_login: user.last_login,
    }))
}

fn create_token(state: &AppState, user_id: Uuid, nickname: &str) -> Result<String> {
    let now = Utc::now();
    let expiration = now
        .checked_add_signed(Duration::hours(24))
        .ok_or_else(|| AppError::Internal(anyhow!("無法計算令牌過期時間")))?;

    let claims = Claims {
        sub: user_id.to_string(),
        nickname: nickname.to_string(),
        exp: expiration.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(anyhow!("無法創建令牌: {}", e)))
} 