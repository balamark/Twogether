use axum::{
    extract::State,
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde_json::json;
use uuid::Uuid;
use validator::Validate;

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
    // Validate input
    payload.validate().map_err(|e| {
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    // Check if user already exists
    let existing_user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = ?"
    )
    .bind(&payload.email)
    .fetch_optional(&state.db.pool)
    .await?;

    if existing_user.is_some() {
        return Err(AppError::Conflict("此電子郵件已被註冊".to_string()));
    }

    // Hash password
    let password_hash = hash_password(&payload.password)?;

    // Create user
    let user_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query(
        "INSERT INTO users (id, nickname, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(user_id.to_string())
    .bind(&payload.nickname)
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(now)
    .execute(&state.db.pool)
    .await?;

    // Create JWT token
    let token = create_token(&state, user_id, &payload.nickname)?;

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
    // Validate input
    payload.validate().map_err(|e| {
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    // Find user by email
    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE email = ?"
    )
    .bind(&payload.email)
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::Auth("電子郵件或密碼錯誤".to_string()))?;

    // Verify password
    if !verify_password(&payload.password, &user.password_hash)? {
        return Err(AppError::Auth("電子郵件或密碼錯誤".to_string()));
    }

    // Update last login
    let now = Utc::now();
    sqlx::query("UPDATE users SET last_login = ? WHERE id = ?")
        .bind(now)
        .bind(user.id.to_string())
        .execute(&state.db.pool)
        .await?;

    // Create JWT token
    let token = create_token(&state, user.id, &user.nickname)?;

    // Return response
    let user_response = UserResponse {
        id: user.id,
        nickname: user.nickname,
        created_at: user.created_at,
        last_login: Some(now),
    };

    Ok(Json(AuthResponse {
        token,
        user: user_response,
    }))
}

/// Get current user info
/// GET /api/auth/me
async fn me(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<UserResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let user = sqlx::query_as::<_, User>(
        "SELECT * FROM users WHERE id = ?"
    )
    .bind(user_id.to_string())
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("用戶不存在".to_string()))?;

    Ok(Json(UserResponse {
        id: user.id,
        nickname: user.nickname,
        created_at: user.created_at,
        last_login: user.last_login,
    }))
}

/// Create JWT token
fn create_token(state: &AppState, user_id: Uuid, nickname: &str) -> Result<String> {
    let now = Utc::now();
    let exp = now + Duration::hours(24 * 7); // 7 days

    let claims = Claims {
        sub: user_id.to_string(),
        nickname: nickname.to_string(),
        exp: exp.timestamp() as usize,
        iat: now.timestamp() as usize,
    };

    let token = encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_ref()),
    )?;

    Ok(token)
} 