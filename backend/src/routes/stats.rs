use axum::{
    extract::State,
    response::Json,
    routing::get,
    Router,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    error::{AppError, Result},
    models::{Claims, IntimacyStats, MonthlyData},
    routes::{
        couples::get_user_couple_id,
        love_moments::{calculate_current_streak, calculate_longest_streak},
    },
    AppState,
};

#[derive(Debug, Serialize)]
pub struct WeeklyStats {
    pub week: String,
    pub count: i64,
    pub coins_earned: i64,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_stats))
        .route("/weekly", get(get_weekly_stats))
}

/// Get intimacy statistics for the couple
/// GET /api/stats
async fn get_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<IntimacyStats>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Get the user's couple ID
    let couple_id = get_user_couple_id(&state, user_id).await?
        .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    // Get this week's and this month's stats
    let current_stats = sqlx::query!(
        "SELECT 
            COUNT(*) FILTER (WHERE moment_date >= DATE_TRUNC('week', NOW())) as this_week,
            COUNT(*) FILTER (WHERE moment_date >= DATE_TRUNC('month', NOW())) as this_month
         FROM love_moments 
         WHERE couple_id = $1",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Calculate weekly average
    let weekly_average = sqlx::query!(
        "WITH weekly_counts AS (
            SELECT DATE_TRUNC('week', moment_date) as week, COUNT(*) as count
            FROM love_moments
            WHERE couple_id = $1
            GROUP BY DATE_TRUNC('week', moment_date)
        )
        SELECT COALESCE(AVG(count::float8), 0) as average
        FROM weekly_counts",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?
    .average
    .unwrap_or(0.0);

    // Calculate monthly average
    let monthly_average = sqlx::query!(
        "WITH monthly_counts AS (
            SELECT DATE_TRUNC('month', moment_date) as month, COUNT(*) as count
            FROM love_moments
            WHERE couple_id = $1
            GROUP BY DATE_TRUNC('month', moment_date)
        )
        SELECT COALESCE(AVG(count::float8), 0) as average
        FROM monthly_counts",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?
    .average
    .unwrap_or(0.0);

    // Get monthly data
    let monthly_data = sqlx::query!(
        "SELECT 
            TO_CHAR(moment_date, 'YYYY-MM') as month,
            COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = $1
         GROUP BY TO_CHAR(moment_date, 'YYYY-MM')
         ORDER BY month DESC
         LIMIT 12",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let monthly_data: Vec<MonthlyData> = monthly_data.into_iter().map(|row| {
        MonthlyData {
            month: row.month.unwrap_or_default(),
            count: row.count.unwrap_or(0),
        }
    }).collect();

    // Calculate streaks
    let current_streak = calculate_current_streak(&state, couple_id).await?;
    let longest_streak = calculate_longest_streak(&state, couple_id).await?;

    Ok(Json(IntimacyStats {
        total_moments: sqlx::query_scalar!(
            "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1",
            couple_id
        )
        .fetch_one(&state.db.pool)
        .await?
        .unwrap_or(0),
        this_week: current_stats.this_week.unwrap_or(0),
        this_month: current_stats.this_month.unwrap_or(0),
        current_streak,
        longest_streak,
        average_per_week: weekly_average,
        average_per_month: monthly_average,
        monthly_data,
    }))
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