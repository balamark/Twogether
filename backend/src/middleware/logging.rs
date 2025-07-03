use std::time::Instant;
use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use tower_http::trace::{TraceLayer};

use crate::AppState;

/// Request logging middleware that captures request details, timing, and response status
pub async fn log_request(
    State(_state): State<AppState>,
    req: Request<Body>,
    next: Next,
) -> Response {
    let start = Instant::now();
    let method = req.method().clone();
    let uri = req.uri().clone();
    let version = req.version();
    let has_auth = req.headers().get("authorization").is_some();
    
    // Get the route pattern if available and clone it
    let matched_path = req
        .extensions()
        .get::<axum::extract::MatchedPath>()
        .map(|mp| mp.as_str().to_string())
        .unwrap_or_default();

    tracing::debug!(
        method = %method,
        uri = %uri,
        version = ?version,
        matched_path = %matched_path,
        auth_present = has_auth,
        "Started processing request"
    );

    let response = next.run(req).await;
    let latency = start.elapsed();
    let status = response.status();

    // Log based on response status
    if status.is_server_error() {
        tracing::error!(
            method = %method,
            uri = %uri,
            matched_path = %matched_path,
            status = %status,
            latency_ms = latency.as_millis(),
            "🔥 Server error occurred while processing request"
        );
    } else if status.is_client_error() {
        match status {
            StatusCode::NOT_FOUND => {
                tracing::warn!(
                    method = %method,
                    uri = %uri,
                    matched_path = %matched_path,
                    status = %status,
                    latency_ms = latency.as_millis(),
                    auth_present = has_auth,
                    "❌ Route not found or resource does not exist"
                );
            }
            StatusCode::UNAUTHORIZED => {
                tracing::warn!(
                    method = %method,
                    uri = %uri,
                    matched_path = %matched_path,
                    status = %status,
                    latency_ms = latency.as_millis(),
                    "🔒 Unauthorized access attempt"
                );
            }
            StatusCode::FORBIDDEN => {
                tracing::warn!(
                    method = %method,
                    uri = %uri,
                    matched_path = %matched_path,
                    status = %status,
                    latency_ms = latency.as_millis(),
                    "🚫 Forbidden access attempt"
                );
            }
            StatusCode::BAD_REQUEST => {
                tracing::warn!(
                    method = %method,
                    uri = %uri,
                    matched_path = %matched_path,
                    status = %status,
                    latency_ms = latency.as_millis(),
                    "⚠️ Bad request received"
                );
            }
            _ => {
                tracing::warn!(
                    method = %method,
                    uri = %uri,
                    matched_path = %matched_path,
                    status = %status,
                    latency_ms = latency.as_millis(),
                    "❓ Client error occurred"
                );
            }
        }
    } else if status.is_success() {
        tracing::info!(
            method = %method,
            uri = %uri,
            matched_path = %matched_path,
            status = %status,
            latency_ms = latency.as_millis(),
            "✅ Request completed successfully"
        );
    }

    response
}

/// Create trace layer for detailed request/response logging
pub fn create_trace_layer() -> TraceLayer<tower_http::classify::SharedClassifier<tower_http::classify::ServerErrorsAsFailures>> {
    TraceLayer::new_for_http()
} 