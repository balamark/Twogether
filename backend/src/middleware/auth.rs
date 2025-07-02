use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{header::AUTHORIZATION, request::Parts, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde_json::json;

use crate::{
    error::{AppError, Result},
    models::Claims,
    AppState,
};

#[async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> std::result::Result<Self, Self::Rejection> {
        // Extract the authorization header
        let authorization = parts
            .headers
            .get(AUTHORIZATION)
            .ok_or_else(|| AppError::Auth("缺少授權標頭".to_string()))?
            .to_str()
            .map_err(|_| AppError::Auth("無效的授權標頭格式".to_string()))?;

        // Extract the token from "Bearer <token>"
        let token = authorization
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Auth("授權標頭必須以 'Bearer ' 開頭".to_string()))?;

        // Decode and verify the JWT token
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map_err(|e| {
            tracing::warn!("JWT verification failed: {:?}", e);
            AppError::Auth("無效的身份驗證令牌".to_string())
        })?;

        Ok(token_data.claims)
    }
} 