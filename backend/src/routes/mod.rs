pub mod auth;
pub mod couples;
pub mod love_moments;
pub mod achievements;
pub mod photos;
pub mod coins;
pub mod stats;

use axum::Router;
use crate::AppState;

pub fn auth_routes() -> Router<AppState> {
    auth::routes()
}

pub fn couple_routes() -> Router<AppState> {
    couples::routes()
}

pub fn love_moment_routes() -> Router<AppState> {
    love_moments::routes()
}

pub fn achievement_routes() -> Router<AppState> {
    achievements::routes()
}

pub fn photo_routes() -> Router<AppState> {
    photos::routes()
}

pub fn coin_routes() -> Router<AppState> {
    coins::routes()
}

pub fn stats_routes() -> Router<AppState> {
    stats::routes()
} 