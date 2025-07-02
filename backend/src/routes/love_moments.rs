use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::{DateTime, Utc, Duration};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::{AppError, Result},
    models::{Claims, CreateLoveMomentRequest, LoveMoment, LoveMomentResponse, IntimacyStats, MonthlyData},
    AppState,
};

#[derive(Debug, Deserialize)]
pub struct LoveMomentsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_love_moment))
        .route("/", get(get_love_moments))
        .route("/stats", get(get_intimacy_stats))
        .route("/:id", get(get_love_moment))
}

/// Create a new love moment
/// POST /api/love-moments
async fn create_love_moment(
    State(state): State<AppState>,
    claims: Claims,
    Json(payload): Json<CreateLoveMomentRequest>,
) -> Result<Json<LoveMomentResponse>> {
    // Validate input
    payload.validate().map_err(|e| {
        AppError::Validation(format!("驗證失敗: {}", e))
    })?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = ? OR user2_id = ?",
        claims.sub,
        claims.sub
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    let couple_id = Uuid::parse_str(&couple.id)
        .map_err(|_| AppError::Internal(anyhow::anyhow!("無效的情侶ID")))?;

    // Create love moment
    let moment_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query!(
        "INSERT INTO love_moments (id, couple_id, recorded_by, moment_date, notes, created_at) 
         VALUES (?, ?, ?, ?, ?, ?)",
        moment_id.to_string(),
        couple_id.to_string(),
        user_id.to_string(),
        payload.moment_date,
        payload.notes,
        now
    )
    .execute(&state.db.pool)
    .await?;

    // Award coins for recording a moment
    let coin_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        coin_id.to_string(),
        couple_id.to_string(),
        100,
        "earn",
        "love_moment",
        "記錄愛的時光",
        now
    )
    .execute(&state.db.pool)
    .await?;

    // Check for achievements (first moment, weekly goals, etc.)
    check_and_award_achievements(&state, couple_id).await?;

    Ok(Json(LoveMomentResponse {
        id: moment_id,
        moment_date: payload.moment_date,
        notes: payload.notes,
        recorded_by_nickname: claims.nickname,
        created_at: now,
    }))
}

/// Get love moments for the couple
/// GET /api/love-moments
async fn get_love_moments(
    State(state): State<AppState>,
    claims: Claims,
    Query(query): Query<LoveMomentsQuery>,
) -> Result<Json<Vec<LoveMomentResponse>>> {
    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = ? OR user2_id = ?",
        claims.sub,
        claims.sub
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對".to_string()))?;

    let mut query_builder = sqlx::QueryBuilder::new(
        "SELECT lm.id, lm.moment_date, lm.notes, lm.created_at, u.nickname as recorded_by_nickname
         FROM love_moments lm
         JOIN users u ON lm.recorded_by = u.id
         WHERE lm.couple_id = "
    );
    query_builder.push_bind(&couple.id);

    if let Some(start_date) = query.start_date {
        query_builder.push(" AND lm.moment_date >= ");
        query_builder.push_bind(start_date);
    }

    if let Some(end_date) = query.end_date {
        query_builder.push(" AND lm.moment_date <= ");
        query_builder.push_bind(end_date);
    }

    query_builder.push(" ORDER BY lm.moment_date DESC");

    if let Some(limit) = query.limit {
        query_builder.push(" LIMIT ");
        query_builder.push_bind(limit);
    }

    if let Some(offset) = query.offset {
        query_builder.push(" OFFSET ");
        query_builder.push_bind(offset);
    }

    let moments = query_builder
        .build_query_as::<LoveMomentResponse>()
        .fetch_all(&state.db.pool)
        .await?;

    Ok(Json(moments))
}

/// Get single love moment
/// GET /api/love-moments/:id
async fn get_love_moment(
    State(state): State<AppState>,
    claims: Claims,
    Path(moment_id): Path<Uuid>,
) -> Result<Json<LoveMomentResponse>> {
    let moment = sqlx::query_as!(
        LoveMomentResponse,
        "SELECT lm.id, lm.moment_date, lm.notes, lm.created_at, u.nickname as recorded_by_nickname
         FROM love_moments lm
         JOIN users u ON lm.recorded_by = u.id
         JOIN couples c ON lm.couple_id = c.id
         WHERE lm.id = ? AND (c.user1_id = ? OR c.user2_id = ?)",
        moment_id.to_string(),
        claims.sub,
        claims.sub
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("愛的時光記錄不存在".to_string()))?;

    Ok(Json(moment))
}

/// Get intimacy statistics
/// GET /api/love-moments/stats
async fn get_intimacy_stats(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<IntimacyStats>> {
    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = ? OR user2_id = ?",
        claims.sub,
        claims.sub
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對".to_string()))?;

    let now = Utc::now();
    let week_ago = now - Duration::days(7);
    let month_ago = now - Duration::days(30);

    // Total moments
    let total_moments = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = ?",
        couple.id
    )
    .fetch_one(&state.db.pool)
    .await?;

    // This week
    let this_week = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = ? AND moment_date >= ?",
        couple.id,
        week_ago
    )
    .fetch_one(&state.db.pool)
    .await?;

    // This month
    let this_month = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = ? AND moment_date >= ?",
        couple.id,
        month_ago
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Calculate current streak
    let current_streak = calculate_current_streak(&state, &couple.id).await?;
    let longest_streak = calculate_longest_streak(&state, &couple.id).await?;

    // Weekly average (last 12 weeks)
    let twelve_weeks_ago = now - Duration::days(84);
    let weekly_total = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = ? AND moment_date >= ?",
        couple.id,
        twelve_weeks_ago
    )
    .fetch_one(&state.db.pool)
    .await?;
    let weekly_average = weekly_total as f64 / 12.0;

    // Monthly data for last 12 months
    let monthly_data = get_monthly_data(&state, &couple.id).await?;

    Ok(Json(IntimacyStats {
        total_moments,
        this_week,
        this_month,
        current_streak,
        longest_streak,
        weekly_average,
        monthly_data,
    }))
}

async fn calculate_current_streak(state: &AppState, couple_id: &str) -> Result<i64> {
    // Implementation for calculating current streak
    // This is a simplified version - you might want to make it more sophisticated
    let moments = sqlx::query!(
        "SELECT DATE(moment_date) as date FROM love_moments 
         WHERE couple_id = ? 
         ORDER BY moment_date DESC",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let mut streak = 0i64;
    let mut current_date = Utc::now().date_naive();

    for moment in moments {
        let moment_date = moment.date.unwrap();
        if moment_date == current_date || moment_date == current_date - Duration::days(1) {
            streak += 1;
            current_date = moment_date - Duration::days(1);
        } else {
            break;
        }
    }

    Ok(streak)
}

async fn calculate_longest_streak(state: &AppState, couple_id: &str) -> Result<i64> {
    // Simplified longest streak calculation
    let moments = sqlx::query!(
        "SELECT DATE(moment_date) as date FROM love_moments 
         WHERE couple_id = ? 
         ORDER BY moment_date ASC",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let mut longest_streak = 0i64;
    let mut current_streak = 0i64;
    let mut prev_date: Option<chrono::NaiveDate> = None;

    for moment in moments {
        let moment_date = moment.date.unwrap();
        
        if let Some(prev) = prev_date {
            if moment_date == prev + Duration::days(1) {
                current_streak += 1;
            } else {
                longest_streak = longest_streak.max(current_streak);
                current_streak = 1;
            }
        } else {
            current_streak = 1;
        }
        
        prev_date = Some(moment_date);
    }

    Ok(longest_streak.max(current_streak))
}

async fn get_monthly_data(state: &AppState, couple_id: &str) -> Result<Vec<MonthlyData>> {
    let twelve_months_ago = Utc::now() - Duration::days(365);
    
    let data = sqlx::query!(
        "SELECT strftime('%Y-%m', moment_date) as month, COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = ? AND moment_date >= ?
         GROUP BY strftime('%Y-%m', moment_date)
         ORDER BY month",
        couple_id,
        twelve_months_ago
    )
    .fetch_all(&state.db.pool)
    .await?;

    let monthly_data = data
        .into_iter()
        .map(|row| MonthlyData {
            month: row.month.unwrap_or_default(),
            count: row.count,
        })
        .collect();

    Ok(monthly_data)
}

async fn check_and_award_achievements(state: &AppState, couple_id: Uuid) -> Result<()> {
    // Check for "Beginner Couple" achievement (first love moment)
    let moment_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = ?",
        couple_id.to_string()
    )
    .fetch_one(&state.db.pool)
    .await?;

    if moment_count == 1 {
        // Award "Beginner Couple" achievement
        let achievement_id = Uuid::new_v4();
        sqlx::query!(
            "INSERT OR IGNORE INTO achievements (id, couple_id, badge_type, earned_date, milestone_value)
             VALUES (?, ?, ?, ?, ?)",
            achievement_id.to_string(),
            couple_id.to_string(),
            "beginner_couple",
            Utc::now(),
            1
        )
        .execute(&state.db.pool)
        .await?;

        // Award achievement coins
        let coin_id = Uuid::new_v4();
        sqlx::query!(
            "INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
            coin_id.to_string(),
            couple_id.to_string(),
            1000,
            "earn",
            "achievement",
            "獲得新手情侶徽章",
            Utc::now()
        )
        .execute(&state.db.pool)
        .await?;
    }

    // TODO: Add more achievement checks for weekly goals, streaks, etc.

    Ok(())
} 