use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::{get, post, put},
    Router,
};
use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::AppError,
    models::{
        AlternativeIntimacyOption, AlternativeIntimacyOptionResponse, AlternativeIntimacyOptionsGrouped,
        Claims, CreateIntimacyRequestRequest, IntimacyRequest, IntimacyRequestResponse, IntimacyTemplate,
        IntimacyTemplateResponse, NotificationResponse, RespondToIntimacyRequestRequest,
        MarkNotificationReadRequest,
    },
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/intimacy-requests", post(create_intimacy_request))
        .route("/intimacy-requests", get(get_intimacy_requests))
        .route("/intimacy-requests/:id/respond", put(respond_to_intimacy_request))
        .route("/intimacy-templates", get(get_intimacy_templates))
        .route("/intimacy-templates/:category", get(get_templates_by_category))
        .route("/alternative-intimacy-options", get(get_alternative_intimacy_options))
        .route("/notifications", get(get_notifications))
        .route("/notifications/mark-read", put(mark_notifications_read))
        .route("/notifications/unread-count", get(get_unread_notification_count))
}

#[derive(Debug, Deserialize)]
pub struct IntimacyRequestsQuery {
    status: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NotificationsQuery {
    notification_type: Option<String>,
    is_read: Option<bool>,
    limit: Option<i64>,
    offset: Option<i64>,
}

// Create a new intimacy request
pub async fn create_intimacy_request(
    State(state): State<AppState>,
    claims: Claims,
    Json(request): Json<CreateIntimacyRequestRequest>,
) -> Result<Json<IntimacyRequestResponse>, AppError> {
    request.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Get the user's couple information
    let couple_query = sqlx::query!(
        "SELECT id, user1_id, user2_id FROM couples WHERE user1_id = $1 OR user2_id = $1",
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?;

    let couple = couple_query.ok_or_else(|| AppError::BadRequest("用戶未配對".to_string()))?;

    // Determine receiver (the other person in the couple)
    let receiver_id = if couple.user1_id == user_id {
        couple.user2_id.ok_or_else(|| AppError::BadRequest("伴侶尚未連接".to_string()))?
    } else {
        couple.user1_id
    };

    // Create the intimacy request
    let intimacy_request = sqlx::query_as!(
        IntimacyRequest,
        r#"
        INSERT INTO intimacy_requests (
            couple_id, sender_id, receiver_id, message_content, 
            request_type, roleplay_category, scheduled_time
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
        "#,
        couple.id,
        user_id,
        receiver_id,
        request.message_content,
        request.request_type,
        request.roleplay_category,
        request.scheduled_time,
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Get sender and receiver info for response and email
    let users = sqlx::query!(
        "SELECT id, nickname, email FROM users WHERE id = $1 OR id = $2",
        user_id,
        receiver_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let sender_nickname = users
        .iter()
        .find(|u| u.id == user_id)
        .map(|u| u.nickname.clone())
        .unwrap_or_default();

    let receiver_nickname = users
        .iter()
        .find(|u| u.id == receiver_id)
        .map(|u| u.nickname.clone())
        .unwrap_or_default();

    // Email the partner about the new request (best-effort)
    if let Some(receiver_email) = users
        .iter()
        .find(|u| u.id == receiver_id)
        .map(|u| u.email.clone())
    {
        let subject = format!("{} 給你發送了親密邀請 💌", sender_nickname);
        let mut extra = String::new();
        if let Some(category) = &request.roleplay_category {
            extra.push_str(&format!("<p>類別：<strong>{}</strong></p>", category));
        }
        if let Some(scheduled) = &request.scheduled_time {
            extra.push_str(&format!("<p>時間：<strong>{}</strong></p>", scheduled));
        }
        let html = format!(
            "<div><p>嗨 {}，</p><p><strong>{}</strong> 給你發送了一個親密邀請：</p><blockquote>{}</blockquote>{}<p>請打開 Twogether 查看並回應 💖</p></div>",
            receiver_nickname,
            sender_nickname,
            request.message_content,
            extra
        );
        if let Err(err) = state
            .email_client
            .send_email(&receiver_email, &subject, &html, None)
            .await
        {
            tracing::warn!("Failed to send intimacy request email: {}", err);
        }
    }

    let response = IntimacyRequestResponse {
        id: intimacy_request.id,
        sender_nickname,
        receiver_nickname,
        message_content: intimacy_request.message_content,
        request_type: intimacy_request.request_type,
        roleplay_category: intimacy_request.roleplay_category,
        scheduled_time: intimacy_request.scheduled_time,
        status: intimacy_request.status,
        responded_at: intimacy_request.responded_at,
        response_message: intimacy_request.response_message,
        alternative_type: intimacy_request.alternative_type,
        alternative_content: intimacy_request.alternative_content,
        alternative_scheduled_time: intimacy_request.alternative_scheduled_time,
        created_at: intimacy_request.created_at,
        expires_at: intimacy_request.expires_at,
    };

    Ok(Json(response))
}

// Get intimacy requests for the authenticated user
pub async fn get_intimacy_requests(
    State(state): State<AppState>,
    claims: Claims,
    Query(query): Query<IntimacyRequestsQuery>,
) -> Result<Json<Vec<IntimacyRequestResponse>>, AppError> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let all_requests = sqlx::query!(
        r#"
        SELECT 
            ir.id, ir.sender_id, ir.receiver_id, ir.message_content,
            ir.request_type, ir.roleplay_category, ir.scheduled_time,
            ir.status, ir.responded_at, ir.response_message,
            ir.alternative_type, ir.alternative_content, ir.alternative_scheduled_time,
            ir.created_at, ir.expires_at,
            sender.nickname as sender_nickname,
            receiver.nickname as receiver_nickname
        FROM intimacy_requests ir
        JOIN users sender ON ir.sender_id = sender.id
        JOIN users receiver ON ir.receiver_id = receiver.id
        WHERE (ir.sender_id = $1 OR ir.receiver_id = $1)
        ORDER BY ir.created_at DESC
        LIMIT $2 OFFSET $3
        "#,
        user_id,
        limit,
        offset
    )
    .fetch_all(&state.db.pool)
    .await?;

    let requests = if let Some(status) = query.status {
        all_requests
            .into_iter()
            .filter(|r| r.status == status)
            .collect()
    } else {
        all_requests
    };

    let response: Vec<IntimacyRequestResponse> = requests
        .into_iter()
        .map(|row| IntimacyRequestResponse {
            id: row.id,
            sender_nickname: row.sender_nickname,
            receiver_nickname: row.receiver_nickname,
            message_content: row.message_content,
            request_type: row.request_type,
            roleplay_category: row.roleplay_category,
            scheduled_time: row.scheduled_time,
            status: row.status,
            responded_at: row.responded_at,
            response_message: row.response_message,
            alternative_type: row.alternative_type,
            alternative_content: row.alternative_content,
            alternative_scheduled_time: row.alternative_scheduled_time,
            created_at: row.created_at,
            expires_at: row.expires_at,
        })
        .collect();

    Ok(Json(response))
}

// Respond to an intimacy request
pub async fn respond_to_intimacy_request(
    State(state): State<AppState>,
    claims: Claims,
    Path(request_id): Path<Uuid>,
    Json(response): Json<RespondToIntimacyRequestRequest>,
) -> Result<Json<IntimacyRequestResponse>, AppError> {
    response.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Verify that the user is the receiver of this request
    let request = sqlx::query_as!(
        IntimacyRequest,
        "SELECT * FROM intimacy_requests WHERE id = $1 AND receiver_id = $2 AND status = 'pending'",
        request_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("找不到待處理的親密請求".to_string()))?;

    // Check if request has expired
    if request.expires_at < Utc::now() {
        return Err(AppError::BadRequest("請求已過期".to_string()));
    }

    let new_status = if response.accept { "accepted" } else { "rejected" };

    // Default acceptance message when none provided
    let response_message_to_use = if response.accept {
        response
            .response_message
            .clone()
            .or_else(|| Some("我接受你的邀請，讓我們延續這個情境吧 💕".to_string()))
    } else {
        response.response_message.clone()
    };

    // Update the request
    let updated_request = sqlx::query_as!(
        IntimacyRequest,
        r#"
        UPDATE intimacy_requests 
        SET 
            status = $1,
            responded_at = $2,
            response_message = $3,
            alternative_type = $4,
            alternative_content = $5,
            alternative_scheduled_time = $6
        WHERE id = $7
        RETURNING *
        "#,
        new_status,
        Utc::now(),
        response_message_to_use,
        response.alternative_type,
        response.alternative_content,
        response.alternative_scheduled_time,
        request_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    // Get user info (nicknames + emails)
    let users = sqlx::query!(
        "SELECT id, nickname, email FROM users WHERE id = $1 OR id = $2",
        updated_request.sender_id,
        updated_request.receiver_id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let sender_nickname = users
        .iter()
        .find(|u| u.id == updated_request.sender_id)
        .map(|u| u.nickname.clone())
        .unwrap_or_default();

    let receiver_nickname = users
        .iter()
        .find(|u| u.id == updated_request.receiver_id)
        .map(|u| u.nickname.clone())
        .unwrap_or_default();

    // Email the original sender about the response (best-effort)
    if let Some(sender_email) = users
        .iter()
        .find(|u| u.id == updated_request.sender_id)
        .map(|u| u.email.clone())
    {
        let subject = if new_status == "accepted" {
            format!("你的親密邀請被接受了 💖 - 來自 {}", receiver_nickname)
        } else {
            format!("你的親密邀請被婉拒 - 來自 {}", receiver_nickname)
        };
        let mut html = String::new();
        if new_status == "accepted" {
            html.push_str(&format!("<p>太好了！<strong>{}</strong> 接受了你的邀請。</p>", receiver_nickname));
        } else {
            html.push_str(&format!("<p>抱歉，<strong>{}</strong> 這次沒有答應。</p>", receiver_nickname));
        }
        if let Some(msg) = &updated_request.response_message {
            html.push_str(&format!("<p>對方的回覆：</p><blockquote>{}</blockquote>", msg));
        }
        if let Some(alt) = &updated_request.alternative_content {
            html.push_str(&format!("<p>建議的替代方案：<em>{}</em></p>", alt));
        }
        html.push_str("<p>打開 Twogether 查看詳情並繼續你們的甜蜜計劃。</p>");
        if let Err(err) = state
            .email_client
            .send_email(&sender_email, &subject, &html, None)
            .await
        {
            tracing::warn!("Failed to send response email: {}", err);
        }
    }

    let response_data = IntimacyRequestResponse {
        id: updated_request.id,
        sender_nickname,
        receiver_nickname,
        message_content: updated_request.message_content,
        request_type: updated_request.request_type,
        roleplay_category: updated_request.roleplay_category,
        scheduled_time: updated_request.scheduled_time,
        status: updated_request.status,
        responded_at: updated_request.responded_at,
        response_message: updated_request.response_message,
        alternative_type: updated_request.alternative_type,
        alternative_content: updated_request.alternative_content,
        alternative_scheduled_time: updated_request.alternative_scheduled_time,
        created_at: updated_request.created_at,
        expires_at: updated_request.expires_at,
    };

    Ok(Json(response_data))
}

// Get intimacy templates
pub async fn get_intimacy_templates(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<Vec<IntimacyTemplateResponse>>, AppError> {
    let templates = sqlx::query_as!(
        IntimacyTemplate,
        "SELECT * FROM intimacy_templates WHERE is_active = true ORDER BY category, created_at"
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response: Vec<IntimacyTemplateResponse> = templates
        .into_iter()
        .map(|t| IntimacyTemplateResponse {
            id: t.id,
            category: t.category,
            time_hint: t.time_hint,
            roleplay_setup: t.roleplay_setup,
            suggestion_level: t.suggestion_level,
        })
        .collect();

    Ok(Json(response))
}

// Get templates by category
pub async fn get_templates_by_category(
    State(state): State<AppState>,
    _claims: Claims,
    Path(category): Path<String>,
) -> Result<Json<Vec<IntimacyTemplateResponse>>, AppError> {
    let templates = sqlx::query_as!(
        IntimacyTemplate,
        "SELECT * FROM intimacy_templates WHERE category = $1 AND is_active = true ORDER BY created_at",
        category
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response: Vec<IntimacyTemplateResponse> = templates
        .into_iter()
        .map(|t| IntimacyTemplateResponse {
            id: t.id,
            category: t.category,
            time_hint: t.time_hint,
            roleplay_setup: t.roleplay_setup,
            suggestion_level: t.suggestion_level,
        })
        .collect();

    Ok(Json(response))
}

// Get alternative intimacy options
pub async fn get_alternative_intimacy_options(
    State(state): State<AppState>,
    _claims: Claims,
) -> Result<Json<AlternativeIntimacyOptionsGrouped>, AppError> {
    let options = sqlx::query_as!(
        AlternativeIntimacyOption,
        "SELECT * FROM alternative_intimacy_options ORDER BY category, sort_order, title"
    )
    .fetch_all(&state.db.pool)
    .await?;

    let mut grouped = AlternativeIntimacyOptionsGrouped {
        physical: Vec::new(),
        emotional: Vec::new(),
        playful: Vec::new(),
        companionship: Vec::new(),
    };

    for option in options {
        let response_option = AlternativeIntimacyOptionResponse {
            id: option.id,
            category: option.category.clone(),
            title: option.title,
            description: option.description,
            estimated_duration: option.estimated_duration,
        };

        match option.category.as_str() {
            "physical" => grouped.physical.push(response_option),
            "emotional" => grouped.emotional.push(response_option),
            "playful" => grouped.playful.push(response_option),
            "companionship" => grouped.companionship.push(response_option),
            _ => {} // Skip unknown categories
        }
    }

    Ok(Json(grouped))
}

// Get notifications for user
pub async fn get_notifications(
    State(state): State<AppState>,
    claims: Claims,
    Query(query): Query<NotificationsQuery>,
) -> Result<Json<Vec<NotificationResponse>>, AppError> {
    let limit = query.limit.unwrap_or(50).min(100);
    let offset = query.offset.unwrap_or(0);

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let notifications = sqlx::query!(
        r#"
        SELECT 
            n.id, n.notification_type, n.title, n.content,
            n.intimacy_request_id, n.is_read, n.read_at,
            n.created_at, n.priority,
            related_user.nickname as "related_user_nickname?"
        FROM notifications n
        LEFT JOIN users related_user ON n.related_user_id = related_user.id
        WHERE n.user_id = $1
          AND ($2::text IS NULL OR n.notification_type = $2)
          AND ($3::boolean IS NULL OR n.is_read = $3)
        ORDER BY n.created_at DESC
        LIMIT $4 OFFSET $5
        "#,
        user_id,
        query.notification_type.as_deref(),
        query.is_read,
        limit,
        offset
    )
    .fetch_all(&state.db.pool)
    .await?;

    let response: Vec<NotificationResponse> = notifications
        .into_iter()
        .map(|row| NotificationResponse {
            id: row.id,
            notification_type: row.notification_type,
            title: row.title,
            content: row.content,
            intimacy_request_id: row.intimacy_request_id,
            related_user_nickname: row.related_user_nickname,
            is_read: row.is_read,
            read_at: row.read_at,
            created_at: row.created_at,
            priority: row.priority,
        })
        .collect();

    Ok(Json(response))
}

// Mark notifications as read
pub async fn mark_notifications_read(
    State(state): State<AppState>,
    claims: Claims,
    Json(request): Json<MarkNotificationReadRequest>,
) -> Result<StatusCode, AppError> {
    if request.notification_ids.is_empty() {
        return Err(AppError::BadRequest("至少需要提供一個通知ID".to_string()));
    }

    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Update notifications individually since PostgreSQL array handling is complex
    for notification_id in &request.notification_ids {
        sqlx::query!(
            r#"
            UPDATE notifications 
            SET is_read = true, read_at = $1 
            WHERE user_id = $2 AND id = $3 AND is_read = false
            "#,
            Utc::now(),
            user_id,
            notification_id
        )
        .execute(&state.db.pool)
        .await?;
    }

    Ok(StatusCode::OK)
}

// Get unread notification count
pub async fn get_unread_notification_count(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<serde_json::Value>, AppError> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let count = sqlx::query!(
        "SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false",
        user_id
    )
    .fetch_one(&state.db.pool)
    .await?;

    Ok(Json(serde_json::json!({
        "unread_count": count.count.unwrap_or(0)
    })))
}
