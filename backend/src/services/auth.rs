use bcrypt::{hash, verify, DEFAULT_COST};
use crate::error::{AppError, Result};

/// Hash a password using bcrypt
pub fn hash_password(password: &str) -> Result<String> {
    hash(password, DEFAULT_COST).map_err(AppError::from)
}

/// Verify a password against its hash
pub fn verify_password(password: &str, hash: &str) -> Result<bool> {
    verify(password, hash).map_err(AppError::from)
} 