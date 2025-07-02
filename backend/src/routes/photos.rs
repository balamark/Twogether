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
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use anyhow::anyhow;

use crate::{
    error::{AppError, Result},
    models::{Claims, CreatePhotoRequest, PhotoResponse},
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
                
                // Validate file extension
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

    // Generate unique filename
    let photo_id = Uuid::new_v4();
    let extension = std::path::Path::new(&file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("jpg");
    
    let unique_filename = format!("{}_{}.{}", couple_id, photo_id, extension);
    
    // Create upload directory if it doesn't exist
    let upload_dir = PathBuf::from(&state.config.upload_path);
    fs::create_dir_all(&upload_dir).await.map_err(|e| {
        AppError::Internal(anyhow!("創建上傳目錄失敗: {}", e))
    })?;

    // Save file to disk
    let file_path = upload_dir.join(&unique_filename);
    let mut file = fs::File::create(&file_path).await.map_err(|e| {
        AppError::Internal(anyhow!("創建文件失敗: {}", e))
    })?;
    
    file.write_all(&file_data).await.map_err(|e| {
        AppError::Internal(anyhow!("寫入文件失敗: {}", e))
    })?;

    // Save photo metadata to database
    let now = Utc::now();
    sqlx::query!(
        "INSERT INTO photos (id, couple_id, file_path, file_name, caption, upload_date, memory_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
        photo_id,
        couple_id,
        unique_filename,
        file_name,
        caption,
        now,
        memory_date
    )
    .execute(&state.db.pool)
    .await?;

    // Generate photo URL
    let photo_url = format!("/api/photos/{}/file", photo_id);

    Ok(Json(PhotoResponse {
        id: photo_id,
        file_name,
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
        "SELECT id, file_name, caption, upload_date, memory_date
         FROM photos 
         WHERE couple_id = $1 
         ORDER BY memory_date DESC",
        couple.id
    )
    .fetch_all(&state.db.pool)
    .await?;

    let photo_responses: Vec<PhotoResponse> = photos.into_iter().map(|photo| {
        PhotoResponse {
            id: photo.id,
            file_name: photo.file_name,
            caption: photo.caption,
            upload_date: photo.upload_date.unwrap_or_else(|| Utc::now()),
            memory_date: photo.memory_date,
            url: format!("/api/photos/{}/file", photo.id),
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
        "SELECT p.id, p.file_name, p.caption, p.upload_date, p.memory_date
         FROM photos p
         JOIN couples c ON p.couple_id = c.id
         WHERE p.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)",
        photo_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("照片不存在".to_string()))?;

    Ok(Json(PhotoResponse {
        id: photo.id,
        file_name: photo.file_name,
        caption: photo.caption,
        upload_date: photo.upload_date.unwrap_or_else(|| Utc::now()),
        memory_date: photo.memory_date,
        url: format!("/api/photos/{}/file", photo.id),
    }))
}

/// Serve photo file
/// GET /api/photos/:id/file
async fn serve_photo_file(
    State(state): State<AppState>,
    claims: Claims,
    Path(photo_id): Path<Uuid>,
) -> Result<Response> {
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("無效的用戶ID".to_string()))?;

    // Verify user has access to this photo
    let photo = sqlx::query!(
        "SELECT p.file_path, p.file_name
         FROM photos p
         JOIN couples c ON p.couple_id = c.id
         WHERE p.id = $1 AND (c.user1_id = $2 OR c.user2_id = $2)",
        photo_id,
        user_id
    )
    .fetch_optional(&state.db.pool)
    .await?
    .ok_or_else(|| AppError::NotFound("照片不存在或無權限訪問".to_string()))?;

    // Read file from disk
    let file_path = PathBuf::from(&state.config.upload_path).join(&photo.file_path);
    let file_data = fs::read(&file_path).await.map_err(|e| {
        AppError::Internal(anyhow!("讀取照片文件失敗: {}", e))
    })?;

    // Determine content type from file extension
    let content_type = match std::path::Path::new(&photo.file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        _ => "application/octet-stream",
    };

    Ok((
        StatusCode::OK,
        [(header::CONTENT_TYPE, content_type)],
        file_data,
    ).into_response())
} 