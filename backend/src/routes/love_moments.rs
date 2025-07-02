use axum::{
    extract::{Path, Query, State},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use uuid::Uuid;
use chrono::{DateTime, Duration, Utc};
use validator::Validate;

use crate::{
    error::{AppError, Result},
    models::{Claims, CreateLoveMomentRequest, IntimacyStats, LoveMomentResponse, MonthlyData},
    AppState,
};

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // These fields will be used for filtering in future implementation
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
        .route("/:id", get(get_love_moment))
        .route("/stats", get(get_intimacy_stats))
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
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對。請先創建情侶檔案。".to_string()))?;

    let couple_id = couple.id;

    // Create love moment
    let moment_id = Uuid::new_v4();
    let now = Utc::now();

    sqlx::query!(
        "INSERT INTO love_moments (id, couple_id, recorded_by, moment_date, notes, description, duration, location, roleplay_script, photo_id, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
        moment_id,
        couple_id,
        user_id,
        payload.moment_date,
        payload.notes,
        payload.description,
        payload.duration,
        payload.location,
        payload.roleplay_script,
        payload.photo_id,
        now
    )
    .execute(&state.db.pool)
    .await?;

    // Award coins for recording a moment
    let coin_id = Uuid::new_v4();
    sqlx::query!(
        "INSERT INTO coin_transactions (id, couple_id, amount, transaction_type, earned_from, description, transaction_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        coin_id,
        couple_id,
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

    // Get photo URL if photo_id is provided
    let photo_url = if let Some(photo_id) = payload.photo_id {
        Some(format!("/api/photos/{}/file", photo_id))
    } else {
        None
    };

    Ok(Json(LoveMomentResponse {
        id: moment_id,
        moment_date: payload.moment_date,
        notes: payload.notes,
        description: payload.description,
        duration: payload.duration,
        location: payload.location,
        roleplay_script: payload.roleplay_script,
        photo_url,
        recorded_by_nickname: claims.nickname,
        created_at: now,
    }))
}

/// Get love moments for the couple
/// GET /api/love-moments
async fn get_love_moments(
    State(state): State<AppState>,
    claims: Claims,
    Query(_query): Query<LoveMomentsQuery>,
) -> Result<Json<Vec<LoveMomentResponse>>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Find the user's couple
    let couple = sqlx::query!(
        "SELECT id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("您還沒有配對".to_string()))?;

    // Query with photo information
    let moments = sqlx::query!(
        "SELECT lm.id, lm.moment_date, lm.notes, lm.description, lm.duration, lm.location, lm.roleplay_script, lm.photo_id, lm.created_at, u.nickname as recorded_by_nickname
         FROM love_moments lm
         JOIN users u ON lm.recorded_by = u.id
         WHERE lm.couple_id = $1
         ORDER BY lm.moment_date DESC
         LIMIT 100",
        couple.id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response_moments: Vec<LoveMomentResponse> = moments.into_iter().map(|moment| {
        let photo_url = moment.photo_id.map(|id| format!("/api/photos/{}/file", id));
        
        LoveMomentResponse {
            id: moment.id,
            moment_date: moment.moment_date,
            notes: moment.notes,
            description: moment.description,
            duration: moment.duration,
            location: moment.location,
            roleplay_script: moment.roleplay_script,
            photo_url,
            recorded_by_nickname: moment.recorded_by_nickname,
            created_at: moment.created_at.unwrap_or_else(|| Utc::now()),
        }
    }).collect();

    Ok(Json(response_moments))
}

/// Get single love moment
/// GET /api/love-moments/:id
async fn get_love_moment(
    State(state): State<AppState>,
    claims: Claims,
    Path(moment_id): Path<Uuid>,
) -> Result<Json<LoveMomentResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let moment = sqlx::query!(
        "SELECT lm.id, lm.moment_date, lm.notes, lm.description, lm.duration, lm.location, lm.roleplay_script, lm.photo_id, lm.created_at, u.nickname as recorded_by_nickname
         FROM love_moments lm
         JOIN users u ON lm.recorded_by = u.id
         JOIN couples c ON lm.couple_id = c.id
         WHERE lm.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)",
        moment_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("愛的時光記錄不存在".to_string()))?;

    let photo_url = moment.photo_id.map(|id| format!("/api/photos/{}/file", id));

    let response = LoveMomentResponse {
        id: moment.id,
        moment_date: moment.moment_date,
        notes: moment.notes,
        description: moment.description,
        duration: moment.duration,
        location: moment.location,
        roleplay_script: moment.roleplay_script,
        photo_url,
        recorded_by_nickname: moment.recorded_by_nickname,
        created_at: moment.created_at.unwrap_or_else(|| Utc::now()),
    };

    Ok(Json(response))
}

/// Get intimacy statistics
/// GET /api/love-moments/stats
async fn get_intimacy_stats(
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
    .ok_or_else(|| AppError::NotFound("您還沒有配對".to_string()))?;

    let now = Utc::now();
    let week_ago = now - Duration::days(7);
    let month_ago = now - Duration::days(30);

    // Total moments
    let total_moments = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1",
        couple.id
    )
    .fetch_one(&state.db.pool)
    .await?;

    // This week
    let this_week = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1 AND moment_date >= $2",
        couple.id,
        week_ago
    )
    .fetch_one(&state.db.pool)
    .await?;

    // This month
    let this_month = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1 AND moment_date >= $2",
        couple.id,
        month_ago
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Calculate current streak
    let current_streak = calculate_current_streak(&state, couple.id).await?;
    let longest_streak = calculate_longest_streak(&state, couple.id).await?;

    // Weekly average (last 12 weeks)
    let twelve_weeks_ago = now - Duration::days(84);
    let weekly_total = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1 AND moment_date >= $2",
        couple.id,
        twelve_weeks_ago
    )
    .fetch_one(&state.db.pool)
    .await?;

    let weekly_average = weekly_total.unwrap_or(0) as f64 / 12.0;

    // Monthly data for the last 12 months
    let monthly_data = get_monthly_data(&state, couple.id).await?;

    Ok(Json(IntimacyStats {
        total_moments: total_moments.unwrap_or(0),
        this_week: this_week.unwrap_or(0),
        this_month: this_month.unwrap_or(0),
        current_streak,
        longest_streak,
        weekly_average,
        monthly_data,
    }))
}

async fn calculate_current_streak(state: &AppState, couple_id: Uuid) -> Result<i64> {
    let moments = sqlx::query!(
        "SELECT DATE(moment_date) as moment_date 
         FROM love_moments 
         WHERE couple_id = $1 
         ORDER BY moment_date DESC",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    if moments.is_empty() {
        return Ok(0);
    }

    let mut streak = 0;
    let mut current_date = Utc::now().date_naive();

    for moment in moments {
        let moment_date = moment.moment_date.unwrap();
        
        if moment_date == current_date {
            streak += 1;
            current_date = current_date.pred_opt().unwrap_or(current_date);
        } else if moment_date == current_date.pred_opt().unwrap_or(current_date) {
            streak += 1;
            current_date = moment_date.pred_opt().unwrap_or(moment_date);
        } else {
            break;
        }
    }

    Ok(streak)
}

async fn calculate_longest_streak(state: &AppState, couple_id: Uuid) -> Result<i64> {
    let moments = sqlx::query!(
        "SELECT DISTINCT DATE(moment_date) as moment_date 
         FROM love_moments 
         WHERE couple_id = $1 
         ORDER BY moment_date",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    if moments.is_empty() {
        return Ok(0);
    }

    let mut max_streak = 1;
    let mut current_streak = 1;

    for i in 1..moments.len() {
        let prev_date = moments[i-1].moment_date.unwrap();
        let curr_date = moments[i].moment_date.unwrap();
        
        if curr_date == prev_date.succ_opt().unwrap_or(prev_date) {
            current_streak += 1;
            max_streak = max_streak.max(current_streak);
        } else {
            current_streak = 1;
        }
    }

    Ok(max_streak)
}

async fn get_monthly_data(state: &AppState, couple_id: Uuid) -> Result<Vec<MonthlyData>> {
    let data = sqlx::query!(
        "SELECT 
            TO_CHAR(moment_date, 'YYYY-MM') as month,
            COUNT(*) as count
         FROM love_moments 
         WHERE couple_id = $1 
           AND moment_date >= NOW() - INTERVAL '12 months'
         GROUP BY TO_CHAR(moment_date, 'YYYY-MM')
         ORDER BY month",
        couple_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    Ok(data.into_iter().map(|row| MonthlyData {
        month: row.month.unwrap_or_default(),
        count: row.count.unwrap_or(0),
    }).collect())
}

async fn check_and_award_achievements(state: &AppState, couple_id: Uuid) -> Result<()> {
    // Check for first moment achievement
    let moment_count = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM love_moments WHERE couple_id = $1",
        couple_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    if moment_count == Some(1) {
        // Award "beginner_couple" achievement
        let achievement_id = Uuid::new_v4();
        sqlx::query!(
            "INSERT INTO achievements (id, couple_id, badge_type, earned_date, milestone_value)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (couple_id, badge_type) DO NOTHING",
            achievement_id,
            couple_id,
            "beginner_couple",
            Utc::now(),
            1
        )
        .execute(&state.db.pool)
        .await?;
    }

    Ok(())
} 