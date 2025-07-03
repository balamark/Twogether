use axum::{
    extract::State,
    response::Json,
    routing::get,
    Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::Claims,
    AppState,
};

#[derive(Debug, Serialize)]
pub struct IntimacyStats {
    pub total_moments: i64,
    pub total_days: i64,
    pub total_months: i64,
    pub average_per_month: f64,
    pub average_per_week: f64,
    pub longest_streak: i64,
    pub current_streak: i64,
    pub total_coins_earned: i64,
    pub total_coins_spent: i64,
    pub current_balance: i64,
    pub favorite_activity: Option<String>,
    pub most_active_month: Option<String>,
    pub most_active_day: Option<String>,
    pub first_record_date: Option<DateTime<Utc>>,
    pub last_record_date: Option<DateTime<Utc>>,
    pub total_duration_hours: f64,
    pub average_duration_minutes: f64,
}

#[derive(Debug, Serialize)]
pub struct MonthlyStats {
    pub month: String,
    pub count: i64,
    pub coins_earned: i64,
}

#[derive(Debug, Serialize)]
pub struct WeeklyStats {
    pub week: String,
    pub count: i64,
    pub coins_earned: i64,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_stats))
        .route("/monthly", get(get_monthly_stats))
        .route("/weekly", get(get_weekly_stats))
}

/// Get intimacy statistics
/// GET /api/stats
async fn get_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<IntimacyStats>> {
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

    // Get basic statistics
    let basic_stats = sqlx::query!(
        "SELECT 
            COUNT(*) as total_moments,
            COUNT(DISTINCT DATE(moment_date)) as total_days,
            COUNT(DISTINCT EXTRACT(YEAR FROM moment_date) || '-' || EXTRACT(MONTH FROM moment_date)) as total_months,
            COALESCE(SUM(coins_earned), 0) as total_coins_earned,
            MIN(moment_date) as first_record_date,
            MAX(moment_date) as last_record_date
         FROM love_moments 
         WHERE couple_id = $1",
        couple.id
    )
    .fetch_one(&state.db.pool)
    .await?;

    let total_moments = basic_stats.total_moments.unwrap_or(0);
    let total_days = basic_stats.total_days.unwrap_or(0);
    let total_months = basic_stats.total_months.unwrap_or(0);
    let total_coins_earned = basic_stats.total_coins_earned.unwrap_or(0);

    // Calculate averages
    let average_per_month = if total_months > 0 {
        total_moments as f64 / total_months as f64
    } else {
        0.0
    };

    let average_per_week = if total_days > 0 {
        total_moments as f64 / (total_days as f64 / 7.0)
    } else {
        0.0
    };

    // Get favorite activity
    let favorite_activity = sqlx::query!(
        "SELECT activity_type, COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = $1 AND activity_type IS NOT NULL
         GROUP BY activity_type
         ORDER BY count DESC
         LIMIT 1",
        couple.id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .map(|r| r.activity_type)
    .flatten();

    // Get most active month
    let most_active_month = sqlx::query!(
        "SELECT 
            TO_CHAR(moment_date, 'YYYY-MM') as month,
            COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = $1
         GROUP BY TO_CHAR(moment_date, 'YYYY-MM')
         ORDER BY count DESC
         LIMIT 1",
        couple.id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .map(|r| r.month)
    .flatten();

    // Get most active day of week
    let most_active_day = sqlx::query!(
        "SELECT 
            CASE EXTRACT(DOW FROM moment_date)
                WHEN 0 THEN 'Sunday'
                WHEN 1 THEN 'Monday'
                WHEN 2 THEN 'Tuesday'
                WHEN 3 THEN 'Wednesday'
                WHEN 4 THEN 'Thursday'
                WHEN 5 THEN 'Friday'
                WHEN 6 THEN 'Saturday'
            END as day_name,
            COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = $1
         GROUP BY EXTRACT(DOW FROM moment_date)
         ORDER BY count DESC
         LIMIT 1",
        couple.id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .map(|r| r.day_name)
    .flatten();

    // Get coin balance
    let coin_balance = sqlx::query!(
        "SELECT 
            COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE 0 END), 0) as total_earned,
            COALESCE(SUM(CASE WHEN transaction_type = 'spend' THEN amount ELSE 0 END), 0) as total_spent,
            COALESCE(SUM(CASE WHEN transaction_type = 'earn' THEN amount ELSE -amount END), 0) as current_balance
         FROM coin_transactions 
         WHERE couple_id = $1",
        couple.id
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Calculate streaks (simplified - could be more complex)
    let current_streak = 0; // TODO: Implement streak calculation
    let longest_streak = 0; // TODO: Implement streak calculation

    Ok(Json(IntimacyStats {
        total_moments,
        total_days,
        total_months,
        average_per_month,
        average_per_week,
        longest_streak,
        current_streak,
        total_coins_earned,
        total_coins_spent: coin_balance.total_spent.unwrap_or(0),
        current_balance: coin_balance.current_balance.unwrap_or(0),
        favorite_activity,
        most_active_month,
        most_active_day,
        first_record_date: basic_stats.first_record_date,
        last_record_date: basic_stats.last_record_date,
        total_duration_hours: 0.0, // TODO: Implement duration calculation
        average_duration_minutes: 0.0, // TODO: Implement duration calculation
    }))
}

/// Get monthly statistics
/// GET /api/stats/monthly
async fn get_monthly_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<MonthlyStats>>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    let monthly_stats = sqlx::query!(
        "SELECT 
            TO_CHAR(moment_date, 'YYYY-MM') as month,
            COUNT(*) as count,
            COALESCE(SUM(coins_earned), 0) as coins_earned
         FROM love_moments 
         WHERE couple_id = $1
         GROUP BY TO_CHAR(moment_date, 'YYYY-MM')
         ORDER BY month DESC
         LIMIT 12",
        couple.id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response_stats: Vec<MonthlyStats> = monthly_stats.into_iter().map(|stat| {
        MonthlyStats {
            month: stat.month.unwrap_or_default(),
            count: stat.count.unwrap_or(0),
            coins_earned: stat.coins_earned.unwrap_or(0),
        }
    }).collect();

    Ok(Json(response_stats))
}

/// Get weekly statistics
/// GET /api/stats/weekly
async fn get_weekly_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<WeeklyStats>>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    let weekly_stats = sqlx::query!(
        "SELECT 
            TO_CHAR(DATE_TRUNC('week', moment_date), 'YYYY-MM-DD') as week,
            COUNT(*) as count,
            COALESCE(SUM(coins_earned), 0) as coins_earned
         FROM love_moments 
         WHERE couple_id = $1
         GROUP BY DATE_TRUNC('week', moment_date)
         ORDER BY week DESC
         LIMIT 12",
        couple.id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response_stats: Vec<WeeklyStats> = weekly_stats.into_iter().map(|stat| {
        WeeklyStats {
            week: stat.week.unwrap_or_default(),
            count: stat.count.unwrap_or(0),
            coins_earned: stat.coins_earned.unwrap_or(0),
        }
    }).collect();

    Ok(Json(response_stats))
} 