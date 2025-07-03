use axum::{
    extract::{Multipart, Path, State},
    response::Json,
    routing::{get, post},
    Router,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use uuid::Uuid;
use chrono::Utc;
// use anyhow::anyhow; // Not needed for database storage

use crate::{
    error::{AppError, Result},
    models::{Claims, PhotoResponse},
    AppState,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(upload_photo))
        .route("/", get(get_photos))
        .route("/:id", get(get_photo))
        .route("/:id/file", get(serve_photo_file))
}

/// Upload a photo memory
/// POST /api/photos
async fn upload_photo(
    State(state): State<AppState>,
    claims: Claims,
    mut multipart: Multipart,
) -> Result<Json<PhotoResponse>> {
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

    let mut file_name = String::new();
    let mut file_data: Vec<u8> = Vec::new();
    let mut caption: Option<String> = None;
    let mut memory_date = Utc::now();
    let mut mime_type = String::from("image/jpeg");

    // Process multipart form data
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("處理上傳文件失敗: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();
        
        match name.as_str() {
            "photo" => {
                file_name = field.file_name()
                    .ok_or_else(|| AppError::BadRequest("文件名不能為空".to_string()))?
                    .to_string();
                
                // Get MIME type from field
                if let Some(content_type) = field.content_type() {
                    mime_type = content_type.to_string();
                }
                
                // Validate file extension and MIME type
                let extension = std::path::Path::new(&file_name)
                    .extension()
                    .and_then(|ext| ext.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                
                if !["jpg", "jpeg", "png", "gif", "webp"].contains(&extension.as_str()) {
                    return Err(AppError::BadRequest("不支持的文件格式。請上傳 JPG、PNG、GIF 或 WebP 格式的圖片".to_string()));
                }

                file_data = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("讀取文件數據失敗: {}", e))
                })?.to_vec();

                // Check file size (max 10MB)
                if file_data.len() > state.config.max_file_size {
                    return Err(AppError::BadRequest(format!(
                        "文件太大。最大允許 {} MB", 
                        state.config.max_file_size / 1024 / 1024
                    )));
                }
            },
            "caption" => {
                let bytes = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("讀取標題失敗: {}", e))
                })?;
                caption = Some(String::from_utf8_lossy(&bytes).to_string());
            },
            "memory_date" => {
                let bytes = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("讀取記憶日期失敗: {}", e))
                })?;
                let date_str = String::from_utf8_lossy(&bytes);
                memory_date = chrono::DateTime::parse_from_rfc3339(&date_str)
                    .map_err(|_| AppError::BadRequest("無效的日期格式".to_string()))?
                    .with_timezone(&Utc);
            },
            _ => {
                // Skip unknown fields
            }
        }
    }

    if file_data.is_empty() {
        return Err(AppError::BadRequest("沒有找到上傳的文件".to_string()));
    }

    // Generate unique filename for reference
    let photo_id = Uuid::new_v4();
    let extension = std::path::Path::new(&file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("jpg");
    
    let unique_filename = format!("{}_{}.{}", couple_id, photo_id, extension);
    
    // Upload to Supabase Storage
    let storage_url = state.supabase_storage.upload_photo(
        couple_id,
        photo_id,
        file_data.clone(),
        &unique_filename,
        &mime_type,
    ).await.map_err(|e| {
        tracing::error!("Failed to upload photo to Supabase: {}", e);
        AppError::Internal(anyhow::anyhow!("Failed to upload photo: {}", e))
    })?;

    // Save photo metadata to database
    let now = Utc::now();
    sqlx::query!(
        "INSERT INTO photos (id, couple_id, file_path, file_name, caption, upload_date, memory_date, storage_url, file_size, mime_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
        photo_id,
        couple_id,
        format!("supabase://{}/{}", couple_id, photo_id),
        unique_filename,
        caption,
        now,
        memory_date,
        storage_url,
        file_data.len() as i32,
        mime_type
    )
    .execute(&state.db.pool)
    .await?;

    tracing::info!("Photo uploaded successfully to Supabase: {} ({}KB)", photo_id, file_data.len() / 1024);

    // Use the Supabase URL directly
    let photo_url = storage_url.clone();

    Ok(Json(PhotoResponse {
        id: photo_id,
        file_name: unique_filename,
        caption,
        upload_date: now,
        memory_date,
        url: photo_url,
    }))
}

/// Get photos for the couple
/// GET /api/photos
async fn get_photos(
    State(state): State<AppState>,
    claims: Claims,
) -> Result<Json<Vec<PhotoResponse>>> {
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

    let photos = sqlx::query!(
        "SELECT id, file_name, caption, upload_date, memory_date, storage_url
         FROM photos 
         WHERE couple_id = $1 
         ORDER BY memory_date DESC",
        couple.id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let photo_responses: Vec<PhotoResponse> = photos.into_iter().map(|photo| {
        let url = photo.storage_url.unwrap_or_else(|| {
            // Fallback for old photos without storage_url
            state.supabase_storage.get_photo_url(couple.id, photo.id)
        });
        
        PhotoResponse {
            id: photo.id,
            file_name: photo.file_name,
            caption: photo.caption,
            upload_date: photo.upload_date.unwrap_or_else(|| Utc::now()),
            memory_date: photo.memory_date,
            url,
        }
    }).collect();

    Ok(Json(photo_responses))
}

/// Get single photo
/// GET /api/photos/:id
async fn get_photo(
    State(state): State<AppState>,
    claims: Claims,
    Path(photo_id): Path<Uuid>,
) -> Result<Json<PhotoResponse>> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    let photo = sqlx::query!(
        "SELECT p.id, p.file_name, p.caption, p.upload_date, p.memory_date, p.storage_url, c.id as couple_id
         FROM photos p
         JOIN couples c ON p.couple_id = c.id
         WHERE p.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)",
        photo_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("照片不存在".to_string()))?;

    let url = photo.storage_url.unwrap_or_else(|| {
        // Fallback for old photos without storage_url
        state.supabase_storage.get_photo_url(photo.couple_id, photo.id)
    });

    Ok(Json(PhotoResponse {
        id: photo.id,
        file_name: photo.file_name,
        caption: photo.caption,
        upload_date: photo.upload_date.unwrap_or_else(|| Utc::now()),
        memory_date: photo.memory_date,
        url,
    }))
}

/// Serve photo file (redirect to Supabase URL)
/// GET /api/photos/:id/file
async fn serve_photo_file(
    State(state): State<AppState>,
    claims: Claims,
    Path(photo_id): Path<Uuid>,
) -> Result<Response> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Verify user has access to this photo and get storage URL
    let photo = sqlx::query!(
        "SELECT p.storage_url, c.id as couple_id
         FROM photos p
         JOIN couples c ON p.couple_id = c.id
         WHERE p.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)",
        photo_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("照片不存在或無權限訪問".to_string()))?;

    let storage_url = photo.storage_url.unwrap_or_else(|| {
        // Fallback for old photos without storage_url
        state.supabase_storage.get_photo_url(photo.couple_id, photo_id)
    });

    tracing::debug!("Redirecting to Supabase URL for photo {}: {}", photo_id, storage_url);

    // Redirect to the Supabase storage URL
    Ok((
        StatusCode::FOUND,
        [(header::LOCATION, storage_url.as_str())],
    ).into_response())
} 