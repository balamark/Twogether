use anyhow::Result;
use reqwest::Client;
use serde::Serialize;

#[derive(Clone)]
pub struct EmailClient {
    provider: EmailProvider,
    from_address: String,
}

#[derive(Clone)]
enum EmailProvider {
    Resend { api_key: String, http: Client },
    Smtp(SmtpClient),
}

#[derive(Clone)]
struct SmtpClient {
    host: String,
    port: u16,
    user: String,
    pass: String,
    secure: SmtpSecurity,
}

#[derive(Clone)]
pub enum SmtpSecurity {
    StartTls,
    Tls,
    None,
}

impl EmailClient {
    pub fn new_resend(api_key: String, from_address: String) -> Self {
        Self {
            provider: EmailProvider::Resend { api_key, http: Client::new() },
            from_address,
        }
    }

    pub fn new_smtp(host: String, port: u16, user: String, pass: String, secure: SmtpSecurity, from_address: String) -> Self {
        Self {
            provider: EmailProvider::Smtp(SmtpClient { host, port, user, pass, secure }),
            from_address,
        }
    }

    pub async fn send_email(&self, to: &str, subject: &str, html: &str, text: Option<&str>) -> Result<()> {
        match &self.provider {
            EmailProvider::Resend { api_key, http } => {
                let payload = ResendSendEmailRequest {
                    from: self.from_address.clone(),
                    to: vec![to.to_string()],
                    subject: subject.to_string(),
                    html: html.to_string(),
                    text: text.map(|t| t.to_string()),
                };

                let res = http
                    .post("https://api.resend.com/emails")
                    .bearer_auth(api_key)
                    .json(&payload)
                    .send()
                    .await?;

                if !res.status().is_success() {
                    let status = res.status();
                    let body = res.text().await.unwrap_or_default();
                    anyhow::bail!("Failed to send email via Resend: {} - {}", status, body);
                }
                Ok(())
            }
            EmailProvider::Smtp(smtp) => {
                use lettre::message::{header, MultiPart, SinglePart};
                use lettre::transport::smtp::authentication::Credentials;
                use lettre::{Message, SmtpTransport, Transport};

                // Build multipart email with both text/plain and text/html parts for compatibility
                let plain_text = text.map(|t| t.to_string()).unwrap_or_else(|| {
                    // Derive a simple plain text fallback from HTML by stripping tags minimally
                    let stripped = html.replace("<br>", "\n").replace("<br/>", "\n");
                    html2text::from_read(stripped.as_bytes(), 80)
                });

                let alternative = MultiPart::alternative()
                    .singlepart(
                        SinglePart::builder()
                            .header(header::ContentType::TEXT_PLAIN)
                            .body(plain_text),
                    )
                    .singlepart(
                        SinglePart::builder()
                            .header(header::ContentType::parse("text/html; charset=utf-8").unwrap())
                            .body(html.to_string()),
                    );

                let email = Message::builder()
                    .from(self.from_address.parse()?)
                    .to(to.parse()?)
                    .subject(subject)
                    .multipart(alternative)?;

                let creds = Credentials::new(smtp.user.clone(), smtp.pass.clone());

                let transport = match smtp.secure {
                    SmtpSecurity::StartTls => {
                        SmtpTransport::starttls_relay(&smtp.host)
                            .map_err(|e| anyhow::anyhow!("Invalid SMTP host for STARTTLS: {}", e))?
                            .port(smtp.port)
                            .credentials(creds)
                            .build()
                    }
                    SmtpSecurity::Tls => {
                        use lettre::transport::smtp::client::{Tls, TlsParameters};
                        let tls_params = TlsParameters::builder(smtp.host.clone())
                            .build()
                            .map_err(|e| anyhow::anyhow!("Failed to build TLS params: {}", e))?;
                        SmtpTransport::relay(&smtp.host)
                            .map_err(|e| anyhow::anyhow!("Invalid SMTP host for TLS: {}", e))?
                            .port(smtp.port)
                            .credentials(creds)
                            .tls(Tls::Required(tls_params))
                            .build()
                    }
                    SmtpSecurity::None => {
                        SmtpTransport::builder_dangerous(&smtp.host)
                            .port(smtp.port)
                            .credentials(creds)
                            .build()
                    }
                };

                transport.send(&email)?;
                Ok(())
            }
        }
    }
}

#[derive(Serialize)]
struct ResendSendEmailRequest {
    from: String,
    to: Vec<String>,
    subject: String,
    html: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
}

// Helpers to parse SMTP security from env values
impl SmtpSecurity {
    pub fn from_env(value: Option<String>) -> Self {
        match value.as_deref() {
            Some("ssl") | Some("tls") => SmtpSecurity::Tls,
            Some("starttls") | Some("start-tls") | Some("start_tls") => SmtpSecurity::StartTls,
            _ => SmtpSecurity::StartTls,
        }
    }
}


