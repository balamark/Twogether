use axum::{
    body::{Body, to_bytes},
    http::{Request, StatusCode},
    Json,
};
use serde_json::{json, Value};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

mod common;
use common::{create_test_app, TestApp};

#[derive(Debug)]
struct UserWithToken {
    id: String,
    token: String,
}

// Helper function to create a user and get their token
async fn create_user(app: &TestApp, email: &str, nickname: &str) -> UserWithToken {
    let response = app.router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/auth/register")
                .header("Content-Type", "application/json")
                .body(
                    Body::from(
                        json!({
                            "email": email,
                            "nickname": nickname,
                            "password": "password123"
                        })
                        .to_string()
                    )
                )
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body()).await.unwrap();
    let response: serde_json::Value = serde_json::from_slice(&body).unwrap();

    UserWithToken {
        id: response["user"]["id"].as_str().unwrap().to_string(),
        token: response["token"].as_str().unwrap().to_string(),
    }
}

// Helper function to create a couple
async fn create_couple(app: &TestApp, token: &str, partner_email: &str) -> serde_json::Value {
    let response = app.router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples")
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", token))
                .body(
                    Body::from(
                        json!({
                            "couple_name": "Test Couple",
                            "partner_email": partner_email
                        })
                        .to_string()
                    )
                )
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

// Helper function to get pairing code
async fn get_pairing_code(app: &TestApp, token: &str) -> serde_json::Value {
    let response = app.router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/couples/pairing-code")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

// Helper function to pair with code
async fn pair_with_code(app: &TestApp, token: &str, code: &str) -> serde_json::Value {
    let response = app.router
        .clone()
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples/pair")
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", token))
                .body(
                    Body::from(
                        json!({
                            "code": code
                        })
                        .to_string()
                    )
                )
                .unwrap(),
        )
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::OK);

    let body = to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
}

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_pairing_code_flow_complete() {
    let app = create_test_app().await;
    
    // 1. Register User A
    let user_a = create_user(&app, "user-a@test.com", "測試用戶A").await;
    
    // 2. User A generates pairing code
    let pairing_response = get_pairing_code(&app, &user_a.token).await;
    assert!(pairing_response["code"].as_str().unwrap().len() == 8);
    assert!(pairing_response["expires_at"] > chrono::Utc::now().to_string());
    
    // 3. Register User B
    let user_b = create_user(&app, "user-b@test.com", "測試用戶B").await;
    
    // 4. User B uses pairing code
    let used_code_result = pair_with_code(&app, &user_b.token, pairing_response["code"].as_str().unwrap()).await;
    assert_eq!(used_code_result["user1_nickname"].as_str().unwrap(), "測試用戶A");
    assert_eq!(used_code_result["user2_nickname"].as_str().unwrap(), "測試用戶B");
    
    // 5. Verify both users can get couple info
    let user_a_couple = get_couple(&app, &user_a.token).await;
    let user_b_couple = get_couple(&app, &user_b.token).await;
    assert_eq!(user_a_couple["id"], user_b_couple["id"]);
    assert_eq!(user_a_couple["user2_nickname"].as_str().unwrap(), "測試用戶B");
    assert_eq!(user_b_couple["user1_nickname"].as_str().unwrap(), "測試用戶A");
    
    // 6. Verify pairing code is marked as used
    let used_code_result = pair_with_code(&app, &user_b.token, pairing_response["code"].as_str().unwrap()).await;
    // Should fail because code is already used or user already paired
}

#[tokio::test]
#[ignore] // Skip in CI since no database is available
async fn test_pairing_code_validation_errors() {
    let app = create_test_app().await;
    
    // Register a user
    let user = create_user(&app, "test@test.com", "Test User").await;
    
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
    let app = create_test_app().await;
    
    // Register User A
    let user_a = create_user(&app, "user-a@test.com", "User A").await;
    
    // Generate first pairing code
    let _pairing_code = get_pairing_code(&app, &user_a.token).await;
    
    // Try to generate another code (should fail)
    let response = app.router
        .oneshot(
            Request::builder()
                .method("GET")
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
    let app = create_test_app().await;
    
    // Complete pairing flow
    let user_a = create_user(&app, "user-a@test.com", "User A").await;
    let pairing_code = get_pairing_code(&app, &user_a.token).await;
    let user_b = create_user(&app, "user-b@test.com", "User B").await;
    let _couple = pair_with_code(&app, &user_b.token, pairing_code["code"].as_str().unwrap()).await;
    
    // Try to generate new pairing code (should fail - already paired)
    let response = app.router
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/couples/pairing-code")
                .header("authorization", format!("Bearer {}", user_a.token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::CONFLICT);
    
    // Try to use another pairing code (should fail - already paired)
    let user_c = create_user(&app, "user-c@test.com", "User C").await;
    let another_code = get_pairing_code(&app, &user_c.token).await;
    
    let response = app.router
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/api/couples")
                .header("content-type", "application/json")
                .header("authorization", format!("Bearer {}", user_a.token))
                .body(Body::from(json!({
                    "pairing_code": another_code["code"].as_str().unwrap()
                }).to_string()))
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::CONFLICT);
}

// Helper function to get couple info
async fn get_couple(app: &TestApp, token: &str) -> serde_json::Value {
    let response = app.router
        .clone()
        .oneshot(
            Request::builder()
                .method("GET")
                .uri("/api/couples/current")
                .header("Authorization", format!("Bearer {}", token))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    
    assert_eq!(response.status(), StatusCode::OK);
    
    let body = to_bytes(response.into_body()).await.unwrap();
    serde_json::from_slice(&body).unwrap()
} 