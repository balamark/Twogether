use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::util::ServiceExt;
use uuid::Uuid;

mod common;
use common::{setup_test_app, TestApp};

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_pairing_code_flow_complete() {
    let app = setup_test_app().await;
    
    // 1. Register User A
    let user_a = register_test_user(&app, "user-a@test.com", "測試用戶A", "password123").await;
    
    // 2. User A generates pairing code
    let pairing_response = generate_pairing_code(&app, &user_a.token).await;
    assert!(pairing_response.code.len() == 8);
    assert!(pairing_response.expires_at > chrono::Utc::now());
    
    // 3. Register User B
    let user_b = register_test_user(&app, "user-b@test.com", "測試用戶B", "password123").await;
    
    // 4. User B uses pairing code
    let couple_response = pair_with_code(&app, &user_b.token, &pairing_response.code).await;
    assert_eq!(couple_response.user1_nickname, "測試用戶A");
    assert_eq!(couple_response.user2_nickname.unwrap(), "測試用戶B");
    
    // 5. Verify both users can get couple info
    let user_a_couple = get_couple(&app, &user_a.token).await;
    let user_b_couple = get_couple(&app, &user_b.token).await;
    assert_eq!(user_a_couple.id, user_b_couple.id);
    assert_eq!(user_a_couple.user2_nickname.unwrap(), "測試用戶B");
    assert_eq!(user_b_couple.user1_nickname, "測試用戶A");
    
    // 6. Verify pairing code is marked as used
    let used_code_result = pair_with_code(&app, &user_b.token, &pairing_response.code).await;
    // Should fail because code is already used or user already paired
}

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_pairing_code_validation_errors() {
    let app = setup_test_app().await;
    
    // Register a user
    let user = register_test_user(&app, "test@test.com", "Test User", "password123").await;
    
    // Test invalid pairing code
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", user.token))
                .body(Body::from(json!({
                    "pairing_code": "INVALID1"
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    
    // Test expired pairing code (would require manual database manipulation)
    // Test self-pairing (user trying to use their own code)
}

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_generate_pairing_code_restrictions() {
    let app = setup_test_app().await;
    
    // Register User A
    let user_a = register_test_user(&app, "user-a@test.com", "User A", "password123").await;
    
    // Generate first pairing code
    let _pairing_code = generate_pairing_code(&app, &user_a.token).await;
    
    // Try to generate another code (should fail)
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples/pairing-code")
                .header("authorization", format!("Bearer {}", user_a.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_already_paired_user_restrictions() {
    let app = setup_test_app().await;
    
    // Complete pairing flow
    let user_a = register_test_user(&app, "user-a@test.com", "User A", "password123").await;
    let pairing_code = generate_pairing_code(&app, &user_a.token).await;
    let user_b = register_test_user(&app, "user-b@test.com", "User B", "password123").await;
    let _couple = pair_with_code(&app, &user_b.token, &pairing_code.code).await;
    
    // Try to generate new pairing code (should fail - already paired)
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples/pairing-code")
                .header("authorization", format!("Bearer {}", user_a.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::CONFLICT);
    
    // Try to use another pairing code (should fail - already paired)
    let user_c = register_test_user(&app, "user-c@test.com", "User C", "password123").await;
    let another_code = generate_pairing_code(&app, &user_c.token).await;
    
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", user_a.token))
                .body(Body::from(json!({
                    "pairing_code": another_code.code
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// Helper structs
#[derive(serde::Deserialize)]
struct AuthResponse {
    token: String,
    user: UserData,
}

#[derive(serde::Deserialize)]
struct UserData {
    id: String,
    email: String,
    nickname: String,
}

#[derive(serde::Deserialize)]
struct PairingCodeResponse {
    code: String,
    expires_at: chrono::DateTime<chrono::Utc>,
}

#[derive(serde::Deserialize)]
struct CoupleResponse {
    id: Uuid,
    couple_name: Option<String>,
    anniversary_date: Option<chrono::NaiveDate>,
    user1_nickname: String,
    user2_nickname: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    pairing_code: Option<String>,
}

// Helper functions
async fn register_test_user(app: &TestApp, email: &str, nickname: &str, password: &str) -> AuthResponse {
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("content-type", "application/json")
                .body(Body::from(json!({
                    "email": email,
                    "nickname": nickname,
                    "password": password
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn generate_pairing_code(app: &TestApp, token: &str) -> PairingCodeResponse {
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples/pairing-code")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn pair_with_code(app: &TestApp, token: &str, pairing_code: &str) -> CoupleResponse {
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::from(json!({
                    "pairing_code": pairing_code
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

async fn get_couple(app: &TestApp, token: &str) -> CoupleResponse {
    let response = app.router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/couples")
                .header("authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = hyper::body::to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
} 