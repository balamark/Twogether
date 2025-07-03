use axum::{
    extract::State,
    response::Json,
    routing::get,
    Router,
};
use chrono::Utc;
use serde::Serialize;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::Claims,
    AppState,
};

#[derive(Debug, Serialize)]
pub struct Achievement {
    pub id: Uuid,
    pub title: String,
    pub description: String,
    pub icon: String,
    pub category: String,
    pub unlocked_at: Option<chrono::DateTime<Utc>>,
    pub progress: i32,
    pub max_progress: i32,
    pub is_unlocked: bool,
}

#[derive(Debug, Serialize)]
pub struct AchievementStats {
    pub total_achievements: i32,
    pub unlocked_achievements: i32,
    pub completion_percentage: f64,
    pub recent_achievements: Vec<Achievement>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_achievements))
}

/// Get achievements for the couple
/// GET /api/achievements
async fn get_achievements(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<AchievementStats>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    // Get couple statistics
    let stats = sqlx::query!(
        "SELECT 
            COUNT(*) as total_moments,
            COUNT(DISTINCT DATE(moment_date)) as unique_days,
            COUNT(DISTINCT EXTRACT(YEAR FROM moment_date) || '-' || EXTRACT(MONTH FROM moment_date)) as unique_months,
            COALESCE(SUM(coins_earned), 0) as total_coins_earned
         FROM love_moments 
         WHERE couple_id = $1",
        couple.id
    )
    .fetch_one(&state.db.pool)
    .await?;

    let total_moments = stats.total_moments.unwrap_or(0);
    let unique_days = stats.unique_days.unwrap_or(0);
    let unique_months = stats.unique_months.unwrap_or(0);
    let total_coins_earned = stats.total_coins_earned.unwrap_or(0);

    // Define achievements based on statistics
    let achievements = vec![
        Achievement {
            id: Uuid::new_v4(),
            title: "初次記錄".to_string(),
            description: "記錄第一次愛的時光".to_string(),
            icon: "🌟".to_string(),
            category: "milestone".to_string(),
            unlocked_at: if total_moments > 0 { Some(Utc::now()) } else { None },
            progress: total_moments as i32,
            max_progress: 1,
            is_unlocked: total_moments > 0,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "甜蜜時光".to_string(),
            description: "記錄10次愛的時光".to_string(),
            icon: "💕".to_string(),
            category: "milestone".to_string(),
            unlocked_at: if total_moments >= 10 { Some(Utc::now()) } else { None },
            progress: total_moments as i32,
            max_progress: 10,
            is_unlocked: total_moments >= 10,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "浪漫情侶".to_string(),
            description: "記錄50次愛的時光".to_string(),
            icon: "💖".to_string(),
            category: "milestone".to_string(),
            unlocked_at: if total_moments >= 50 { Some(Utc::now()) } else { None },
            progress: total_moments as i32,
            max_progress: 50,
            is_unlocked: total_moments >= 50,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "愛情專家".to_string(),
            description: "記錄100次愛的時光".to_string(),
            icon: "👑".to_string(),
            category: "milestone".to_string(),
            unlocked_at: if total_moments >= 100 { Some(Utc::now()) } else { None },
            progress: total_moments as i32,
            max_progress: 100,
            is_unlocked: total_moments >= 100,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "每日情侶".to_string(),
            description: "連續記錄7天".to_string(),
            icon: "📅".to_string(),
            category: "streak".to_string(),
            unlocked_at: if unique_days >= 7 { Some(Utc::now()) } else { None },
            progress: unique_days as i32,
            max_progress: 7,
            is_unlocked: unique_days >= 7,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "月度情侶".to_string(),
            description: "記錄3個月的時光".to_string(),
            icon: "📆".to_string(),
            category: "streak".to_string(),
            unlocked_at: if unique_months >= 3 { Some(Utc::now()) } else { None },
            progress: unique_months as i32,
            max_progress: 3,
            is_unlocked: unique_months >= 3,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "金幣收集者".to_string(),
            description: "累積1000金幣".to_string(),
            icon: "💰".to_string(),
            category: "coins".to_string(),
            unlocked_at: if total_coins_earned >= 1000 { Some(Utc::now()) } else { None },
            progress: total_coins_earned as i32,
            max_progress: 1000,
            is_unlocked: total_coins_earned >= 1000,
        },
        Achievement {
            id: Uuid::new_v4(),
            title: "金幣大師".to_string(),
            description: "累積5000金幣".to_string(),
            icon: "💎".to_string(),
            category: "coins".to_string(),
            unlocked_at: if total_coins_earned >= 5000 { Some(Utc::now()) } else { None },
            progress: total_coins_earned as i32,
            max_progress: 5000,
            is_unlocked: total_coins_earned >= 5000,
        },
    ];

    let unlocked_count = achievements.iter().filter(|a| a.is_unlocked).count();
    let total_count = achievements.len();
    let completion_percentage = if total_count > 0 {
        (unlocked_count as f64 / total_count as f64) * 100.0
    } else {
        0.0
    };

    let recent_achievements = achievements
        .into_iter()
        .filter(|a| a.is_unlocked)
        .take(5)
        .collect();

    Ok(Json(AchievementStats {
        total_achievements: total_count as i32,
        unlocked_achievements: unlocked_count as i32,
        completion_percentage,
        recent_achievements,
    }))
} 