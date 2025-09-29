const nodemailer = require('nodemailer');

// Email service for sending pairing invitations
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  initializeTransporter() {
    const emailConfig = {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    };

    if (!emailConfig.host || !emailConfig.auth.user || !emailConfig.auth.pass) {
      console.warn('⚠️ Email service not configured properly. Email features will be disabled.');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport(emailConfig);
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize email service:', error);
    }
  }

  isConfigured() {
    return this.transporter !== null;
  }

  async sendPairingInvitation(senderName, recipientEmail, token, customMessage = '') {
    if (!this.isConfigured()) {
      throw new Error('Email service is not configured');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com';
    const acceptUrl = `${frontendUrl}/pairing/accept?token=${token}`;

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twogether 配對邀請</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 40px 20px; }
        .invitation-card { background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%); padding: 30px; border-radius: 15px; margin: 20px 0; text-align: center; }
        .invitation-card h2 { margin: 0 0 15px 0; color: #2d3436; font-size: 24px; }
        .sender-name { color: #e17055; font-weight: bold; font-size: 20px; }
        .custom-message { background: white; padding: 30px; border-radius: 10px; margin: 20px 0; color: #2d3436; border-left: 4px solid #e17055; }
        .custom-message-text { font-size: 20px; line-height: 1.6; font-weight: 500; margin-top: 10px; }
        .custom-message-label { font-size: 14px; color: #636e72; font-weight: normal; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: bold; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 184, 148, 0.3); transition: transform 0.2s; }
        .cta-button:hover { transform: translateY(-2px); }
        .footer { background-color: #2d3436; color: white; padding: 20px; text-align: center; font-size: 14px; }
        .warning { background: #fdcb6e; padding: 15px; border-radius: 8px; margin: 20px 0; color: #2d3436; }
        .features { display: flex; justify-content: space-around; margin: 30px 0; flex-wrap: wrap; }
        .feature { text-align: center; flex: 1; min-width: 150px; margin: 10px; }
        .feature-icon { font-size: 30px; margin-bottom: 10px; }
        @media (max-width: 600px) {
            .features { flex-direction: column; }
            .content { padding: 20px 15px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💕 Twogether</h1>
            <p>愛情記錄 · 親密時光 · 共創回憶</p>
        </div>

        <div class="content">
            <div class="invitation-card">
                <h2>🎉 你收到了一個配對邀請！</h2>
                <p><span class="sender-name">${senderName}</span> 邀請你成為 Twogether 的情侶伴侶</p>
            </div>

            ${customMessage ? `
            <div class="custom-message">
                <div class="custom-message-label">個人訊息：</div>
                <div class="custom-message-text">"${customMessage}"</div>
            </div>
            ` : ''}

            <div class="features">
                <div class="feature">
                    <div class="feature-icon">📅</div>
                    <p><strong>愛情日曆</strong><br>記錄每個美好時刻</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">🏆</div>
                    <p><strong>成就系統</strong><br>見證愛情里程碑</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">🎮</div>
                    <p><strong>情趣遊戲</strong><br>增進彼此感情</p>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${acceptUrl}" class="cta-button">
                    ❤️ 接受邀請並開始我們的愛情之旅
                </a>
            </div>

            <div class="warning">
                <strong>⏰ 注意：</strong>這個邀請將在 7 天後過期。請盡快回應！
            </div>

            <p style="color: #636e72; font-size: 14px; text-align: center;">
                如果你無法點擊按鈕，請複製以下連結到瀏覽器：<br>
                <code style="background: #f8f9fa; padding: 5px; border-radius: 3px;">${acceptUrl}</code>
            </p>
        </div>

        <div class="footer">
            <p>© 2024 Twogether - 專為情侶打造的愛情記錄應用</p>
            <p style="font-size: 12px; opacity: 0.8;">
                這封郵件是因為有人使用你的電子郵件地址發送配對邀請而寄送。<br>
                如果你不想收到此類郵件，請忽略這封信。
            </p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Twogether 配對邀請

${senderName} 邀請你成為 Twogether 的情侶伴侶！

${customMessage ? `個人訊息："${customMessage}"` : ''}

Twogether 是專為情侶打造的應用程式，讓你們可以：
• 記錄每個美好的愛情時刻
• 追蹤關係中的重要里程碑
• 通過情趣遊戲增進感情

要接受這個邀請，請點擊以下連結：
${acceptUrl}

注意：這個邀請將在 7 天後過期。

---
© 2024 Twogether
如果你不想收到此類郵件，請忽略這封信。
    `;

    const mailOptions = {
      from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: `💕 ${senderName} 邀請你加入 Twogether！`,
      text: textContent,
      html: htmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Pairing invitation sent to ${recipientEmail}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to send pairing invitation:', error);
      throw error;
    }
  }

  async sendPairingAccepted(originalSenderEmail, accepterName) {
    if (!this.isConfigured()) {
      throw new Error('Email service is not configured');
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com';

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>配對成功通知</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; padding: 40px 20px; text-align: center; }
        .content { padding: 40px 20px; text-align: center; }
        .success-card { background: linear-gradient(135deg, #a8e6cf 0%, #88d8c0 100%); padding: 30px; border-radius: 15px; margin: 20px 0; }
        .success-icon { font-size: 60px; margin-bottom: 20px; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: bold; margin: 20px 0; }
        .footer { background-color: #2d3436; color: white; padding: 20px; text-align: center; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 配對成功！</h1>
        </div>

        <div class="content">
            <div class="success-card">
                <div class="success-icon">💕</div>
                <h2>太棒了！</h2>
                <p><strong>${accepterName}</strong> 已經接受了你的配對邀請！</p>
                <p>你們現在可以一起使用 Twogether 記錄美好的愛情時光了。</p>
            </div>

            <a href="${frontendUrl}" class="cta-button">
                🚀 立即開始使用 Twogether
            </a>
        </div>

        <div class="footer">
            <p>© 2024 Twogether - 見證你們的愛情故事</p>
        </div>
    </div>
</body>
</html>
    `;

    const mailOptions = {
      from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
      to: originalSenderEmail,
      subject: `🎉 ${accepterName} 接受了你的配對邀請！`,
      html: htmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Pairing accepted notification sent to ${originalSenderEmail}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to send pairing accepted notification:', error);
      throw error;
    }
  }

  async sendIntimacyRequestNotification(senderName, recipientEmail, requestType, message = '') {
    console.log(`📧 Attempting to send intimacy request email to ${recipientEmail}...`);

    if (!this.isConfigured()) {
      console.warn('⚠️ Email service not configured, skipping intimacy request email');
      return;
    }

    const frontendUrl = process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com';

    const typeTranslations = {
      general: '一般邀請',
      romantic: '浪漫時光',
      playful: '玩樂時光',
      surprise: '驚喜時刻',
      compliment: '甜蜜讚美',
      intimate: '親密時光',
      reconciliation: '真心和解'
    };

    const requestTypeName = typeTranslations[requestType] || '親密邀請';

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>親密邀請通知</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%); color: white; padding: 40px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; font-weight: 300; }
        .content { padding: 40px 20px; }
        .invitation-card { background: linear-gradient(135deg, #ffeaa7 0%, #fab1a0 100%); padding: 30px; border-radius: 15px; margin: 20px 0; text-align: center; }
        .invitation-card h2 { margin: 0 0 15px 0; color: #2d3436; font-size: 24px; }
        .sender-name { color: #e17055; font-weight: bold; font-size: 20px; }
        .custom-message { background: white; padding: 30px; border-radius: 10px; margin: 20px 0; color: #2d3436; border-left: 4px solid #e17055; }
        .custom-message-text { font-size: 20px; line-height: 1.6; font-weight: 500; margin-top: 10px; }
        .custom-message-label { font-size: 14px; color: #636e72; font-weight: normal; }
        .cta-button { display: inline-block; background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; text-decoration: none; padding: 15px 30px; border-radius: 25px; font-weight: bold; margin: 20px 0; box-shadow: 0 4px 15px rgba(0, 184, 148, 0.3); transition: transform 0.2s; }
        .footer { background-color: #2d3436; color: white; padding: 20px; text-align: center; font-size: 14px; }
        .features { display: flex; justify-content: space-around; margin: 30px 0; flex-wrap: wrap; }
        .feature { text-align: center; flex: 1; min-width: 150px; margin: 10px; }
        .feature-icon { font-size: 30px; margin-bottom: 10px; }
        @media (max-width: 600px) {
            .features { flex-direction: column; }
            .content { padding: 20px 15px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💕 親密邀請通知</h1>
            <p>你的伴侶想要與你分享特別的時光</p>
        </div>

        <div class="content">
            <div class="invitation-card">
                <h2>💫 ${requestTypeName}</h2>
                <p><span class="sender-name">${senderName}</span> 向你發送了一個親密邀請</p>
            </div>

            ${message ? `
            <div class="custom-message">
                <div class="custom-message-label">個人訊息：</div>
                <div class="custom-message-text">"${message}"</div>
            </div>
            ` : ''}

            <div class="features">
                <div class="feature">
                    <div class="feature-icon">💕</div>
                    <p><strong>增進感情</strong><br>珍貴的親密時光</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">🌟</div>
                    <p><strong>創造回憶</strong><br>美好的共同體驗</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">🎁</div>
                    <p><strong>獲得獎勵</strong><br>愛情金幣獎勵</p>
                </div>
            </div>

            <div style="text-align: center;">
                <a href="${frontendUrl}" class="cta-button">
                    💕 打開 Twogether 回應邀請
                </a>
            </div>

            <p style="color: #636e72; font-size: 14px; text-align: center; margin-top: 30px;">
                在 Twogether 應用中查看完整邀請並選擇你的回應。<br>
                如果無法點擊按鈕，請直接打開 Twogether 應用。
            </p>
        </div>

        <div class="footer">
            <p>© 2024 Twogether - 專為情侶打造的愛情記錄應用</p>
            <p style="font-size: 12px; opacity: 0.8;">
                這封郵件是因為你的伴侶發送了親密邀請而寄送。<br>
                如果你不想收到此類郵件，請在應用內調整通知設定。
            </p>
        </div>
    </div>
</body>
</html>
    `;

    const textContent = `
Twogether 親密邀請通知

${senderName} 向你發送了一個${requestTypeName}！

${message ? `個人訊息："${message}"` : ''}

在 Twogether 中回應這個邀請，與你的伴侶分享特別的時光。
打開 Twogether 應用來查看完整邀請並選擇你的回應。

---
© 2024 Twogether
如果你不想收到此類郵件，請在應用內調整通知設定。
    `;

    const mailOptions = {
      from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: `💕 ${senderName} 向你發送了${requestTypeName}`,
      text: textContent,
      html: htmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Intimacy request notification sent to ${recipientEmail}`);
      return result;
    } catch (error) {
      console.error('❌ Failed to send intimacy request notification:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();