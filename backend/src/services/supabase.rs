use anyhow::Result;
use reqwest::Client;
use uuid::Uuid;

#[derive(Clone)]
pub struct SupabaseStorage {
    client: Client,
    base_url: String,
    service_role_key: String,
}

impl SupabaseStorage {
    pub fn new(base_url: &str, service_role_key: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.to_string(),
            service_role_key: service_role_key.to_string(),
        }
    }

    pub async fn upload_photo(
        &self,
        couple_id: Uuid,
        photo_id: Uuid,
        data: Vec<u8>,
        _filename: &str,  // Prefix with underscore since we're not using it yet
        content_type: &str,
    ) -> Result<String> {
        let bucket_name = "photos";
        let file_path = format!("{}/{}", couple_id, photo_id);
        
        let url = format!(
            "{}/storage/v1/object/{}/{}",
            self.base_url, bucket_name, file_path
        );

        let response = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .header("Content-Type", content_type)
            .header("x-upsert", "true") // Allow overwriting
            .body(data)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            anyhow::bail!("Failed to upload photo: {}", error_text);
        }

        let public_url = format!(
            "{}/storage/v1/object/public/{}/{}",
            self.base_url, bucket_name, file_path
        );
        Ok(public_url)
    }

    pub async fn delete_photo(&self, couple_id: Uuid, photo_id: Uuid) -> Result<()> {
        let bucket_name = "photos";
        let file_path = format!("{}/{}", couple_id, photo_id);
        
        let url = format!(
            "{}/storage/v1/object/{}/{}",
            self.base_url, bucket_name, file_path
        );

        let response = self
            .client
            .delete(&url)
            .header("Authorization", format!("Bearer {}", self.service_role_key))
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            anyhow::bail!("Failed to delete photo: {}", error_text);
        }

        Ok(())
    }

    pub fn get_photo_url(&self, couple_id: Uuid, photo_id: Uuid) -> String {
        let bucket_name = "photos";
        let file_path = format!("{}/{}", couple_id, photo_id);
        
        format!(
            "{}/storage/v1/object/public/{}/{}",
            self.base_url, bucket_name, file_path
        )
    }
} 