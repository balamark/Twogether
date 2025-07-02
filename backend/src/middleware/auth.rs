use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::{
    error::AppError,
    models::Claims,
    AppState,
};

#[async_trait]
impl FromRequestParts<AppState> for Claims {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        // Get the authorization header
        let authorization = parts
            .headers
            .get(AUTHORIZATION)
            .ok_or_else(|| AppError::Auth("缺少授權標頭".to_string()))?
            .to_str()
            .map_err(|_| AppError::Auth("無效的授權標頭".to_string()))?;

        // Extract the token (remove "Bearer " prefix)
        let token = authorization
            .strip_prefix("Bearer ")
            .ok_or_else(|| AppError::Auth("無效的授權格式".to_string()))?;

        // Decode and validate the token
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(state.config.jwt_secret.as_ref()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Auth("無效的令牌".to_string()))?;

        Ok(token_data.claims)
    }
} 