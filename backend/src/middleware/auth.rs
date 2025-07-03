use axum::{
    async_trait,
    extract::{FromRequestParts, State},
    http::{header::AUTHORIZATION, request::Parts, Request, StatusCode},
    middleware::Next,
    response::Response,
    body::Body,
};
use jsonwebtoken::{decode, DecodingKey, Validation};

use crate::{
    error::AppError,
    models::Claims,
    AppState,
};

pub async fn require_auth(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let auth_header = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|header| header.to_str().ok());

    match auth_header {
        Some(auth_str) if auth_str.starts_with("Bearer ") => {
            let token = auth_str.strip_prefix("Bearer ").unwrap();
            
            // Validate the token
            match decode::<Claims>(
                token,
                &DecodingKey::from_secret(state.config.jwt_secret.as_ref()),
                &Validation::default(),
            ) {
                Ok(_) => Ok(next.run(request).await),
                Err(e) => {
                    tracing::warn!("Invalid token: {}", e);
                    Err(StatusCode::UNAUTHORIZED)
                }
            }
        }
        _ => {
            tracing::warn!("Missing or invalid Authorization header");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

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