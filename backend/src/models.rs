// All models are defined in this single file

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;
use validator::Validate;

// User Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub nickname: String,
    pub email: String,
    pub password_hash: String,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreateUserRequest {
    #[validate(length(min = 2, max = 50, message = "暱稱必須在2-50個字符之間"))]
    pub nickname: String,
    
    #[validate(email(message = "請輸入有效的電子郵件地址"))]
    pub email: String,
    
    #[validate(length(min = 6, message = "密碼至少需要6個字符"))]
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(email(message = "請輸入有效的電子郵件地址"))]
    pub email: String,
    
    #[validate(length(min = 1, message = "請輸入密碼"))]
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub nickname: String,
    pub created_at: DateTime<Utc>,
    pub last_login: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub token: String,
    pub user: UserResponse,
}

// Couple Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Couple {
    pub id: Uuid,
    pub user1_id: Uuid,
    pub user2_id: Uuid,
    pub couple_name: Option<String>,
    pub anniversary_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreateCoupleRequest {
    #[validate(length(min = 1, max = 100, message = "情侶名稱不能為空且不超過100個字符"))]
    pub couple_name: Option<String>,
    
    pub anniversary_date: Option<DateTime<Utc>>,
    
    #[validate(email(message = "請輸入有效的伴侶電子郵件地址"))]
    pub partner_email: String,
}

#[derive(Debug, Serialize)]
pub struct CoupleResponse {
    pub id: Uuid,
    pub couple_name: Option<String>,
    pub anniversary_date: Option<DateTime<Utc>>,
    pub partner: UserResponse,
    pub created_at: DateTime<Utc>,
}

// Love Moment Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct LoveMoment {
    pub id: Uuid,
    pub couple_id: Uuid,
    pub recorded_by: Uuid,
    pub moment_date: DateTime<Utc>,
    pub notes: Option<String>,
    pub description: Option<String>,
    pub duration: Option<String>,
    pub location: Option<String>,
    pub roleplay_script: Option<String>,
    pub photo_id: Option<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreateLoveMomentRequest {
    pub moment_date: DateTime<Utc>,
    
    #[validate(length(max = 500, message = "備註不能超過500個字符"))]
    pub notes: Option<String>,
    
    #[validate(length(max = 1000, message = "描述不能超過1000個字符"))]
    pub description: Option<String>,
    
    #[validate(length(max = 100, message = "持續時間不能超過100個字符"))]
    pub duration: Option<String>,
    
    #[validate(length(max = 200, message = "地點不能超過200個字符"))]
    pub location: Option<String>,
    
    #[validate(length(max = 100, message = "角色扮演劇本名稱不能超過100個字符"))]
    pub roleplay_script: Option<String>,
    
    pub photo_id: Option<Uuid>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct LoveMomentResponse {
    pub id: Uuid,
    pub moment_date: DateTime<Utc>,
    pub notes: Option<String>,
    pub description: Option<String>,
    pub duration: Option<String>,
    pub location: Option<String>,
    pub roleplay_script: Option<String>,
    pub photo_url: Option<String>,
    pub recorded_by_nickname: String,
    pub created_at: DateTime<Utc>,
}

// Achievement Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Achievement {
    pub id: Uuid,
    pub couple_id: Uuid,
    pub badge_type: String,
    pub earned_date: DateTime<Utc>,
    pub milestone_value: Option<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum BadgeType {
    #[serde(rename = "beginner_couple")]
    BeginnerCouple,
    #[serde(rename = "weekly_lovers")]
    WeeklyLovers,
    #[serde(rename = "passionate_couple")]
    PassionatCouple,
    #[serde(rename = "sweet_invincible")]
    SweetInvincible,
    #[serde(rename = "honeymoon_phase")]
    HoneymoonPhase,
    #[serde(rename = "stable_lovers")]
    StableLovers,
    #[serde(rename = "forever_sweet")]
    ForeverSweet,
    #[serde(rename = "true_love_invincible")]
    TrueLoveInvincible,
    #[serde(rename = "adventurers")]
    Adventurers,
    #[serde(rename = "harmony_master")]
    HarmonyMaster,
    #[serde(rename = "memory_collector")]
    MemoryCollector,
    #[serde(rename = "game_expert")]
    GameExpert,
}

#[derive(Debug, Serialize)]
pub struct AchievementResponse {
    pub id: Uuid,
    pub badge_type: String,
    pub badge_name: String,
    pub badge_description: String,
    pub earned_date: DateTime<Utc>,
    pub milestone_value: Option<i32>,
}

// Coin Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct CoinTransaction {
    pub id: Uuid,
    pub couple_id: Uuid,
    pub amount: i32,
    pub transaction_type: String, // "earn" or "spend"
    pub earned_from: Option<String>,
    pub spent_on: Option<String>,
    pub description: String,
    pub transaction_date: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CoinBalance {
    pub couple_id: Uuid,
    pub balance: i32,
    pub last_updated: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CoinEarnRequest {
    pub amount: i32,
    pub earned_from: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CoinSpendRequest {
    pub amount: i32,
    pub spent_on: String,
    pub description: String,
}

// Photo Models
#[derive(Debug, Serialize, Deserialize, FromRow)]
pub struct Photo {
    pub id: Uuid,
    pub couple_id: Uuid,
    pub file_path: String, // Kept for backward compatibility
    pub file_name: String,
    pub caption: Option<String>,
    pub upload_date: DateTime<Utc>,
    pub memory_date: DateTime<Utc>,
    // New fields for database storage
    pub photo_data: Vec<u8>,
    pub file_size: i32,
    pub mime_type: String,
}

#[derive(Debug, Serialize, Deserialize, Validate)]
pub struct CreatePhotoRequest {
    #[validate(length(max = 200, message = "標題不能超過200個字符"))]
    pub caption: Option<String>,
    
    pub memory_date: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct PhotoResponse {
    pub id: Uuid,
    pub file_name: String,
    pub caption: Option<String>,
    pub upload_date: DateTime<Utc>,
    pub memory_date: DateTime<Utc>,
    pub url: String,
}

// Statistics Models
#[derive(Debug, Serialize)]
pub struct IntimacyStats {
    pub total_moments: i64,
    pub this_week: i64,
    pub this_month: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub weekly_average: f64,
    pub monthly_data: Vec<MonthlyData>,
}

#[derive(Debug, Serialize)]
pub struct MonthlyData {
    pub month: String,
    pub count: i64,
}

// JWT Claims
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user_id
    pub nickname: String,
    pub exp: usize,
    pub iat: usize,
} 