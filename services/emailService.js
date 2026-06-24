const nodemailer = require('nodemailer');
const { logInfo, logWarn, logError } = require('../lib/logger');

// Standard fields included with every SMTP-related log entry so that future
// queries like `jsonPayload.code="EAUTH"` find them in a single hop.
function smtpErrorFields(err) {
  return {
    err: err?.message,
    code: err?.code,
    command: err?.command,
    responseCode: err?.responseCode,
    host: process.env.SMTP_HOST,
  };
}

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
      if (process.env.NODE_ENV !== 'test') {
        logWarn('Email service not configured; email features disabled', {
          hasHost: !!emailConfig.host,
          hasUser: !!emailConfig.auth.user,
          hasPass: !!emailConfig.auth.pass,
        });
      }
      return;
    }

    try {
      this.transporter = nodemailer.createTransport(emailConfig);
      if (process.env.NODE_ENV !== 'test') {
        logInfo('Email service initialized', { host: emailConfig.host });
      }
    } catch (error) {
      logError('Email service init failed', smtpErrorFields(error));
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
      logInfo('Pairing invitation sent', { kind: 'pairing_invite' });
      return result;
    } catch (error) {
      logError('Failed to send pairing invitation', { kind: 'pairing_invite', ...smtpErrorFields(error) });
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
      logInfo('Pairing accepted email sent', { kind: 'pairing_accepted' });
      return result;
    } catch (error) {
      logError('Failed to send pairing accepted email', { kind: 'pairing_accepted', ...smtpErrorFields(error) });
      throw error;
    }
  }

  async sendIntimacyRequestNotification(senderName, recipientEmail, requestType, message = '') {
    logInfo('Sending intimacy request email', { kind: 'intimacy_request', requestType });

    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping intimacy request email', { kind: 'intimacy_request' });
      return;
    }

    // A category the sender optionally tagged the message with. Kept as a quiet
    // bit of context — the email is framed as "傳了一則訊息" (sent a message),
    // not a grand 親密邀請, because that's all the action actually is.
    const typeTranslations = {
      general: '一般訊息',
      romantic: '浪漫時光',
      playful: '玩樂時光',
      surprise: '驚喜時刻',
      compliment: '甜蜜讚美',
      intimate: '親密時光',
      reconciliation: '真心和解'
    };
    const typeLabel = typeTranslations[requestType] || '';

    const safeSender = this._escape(senderName || '你的伴侶');
    const safeMessage = this._escape(message).slice(0, 600);

    const bodyHtml = `
      <p><strong>${safeSender}</strong> 傳了一則訊息給你${typeLabel ? `（${typeLabel}）` : ''}：</p>
      ${safeMessage
        ? `<div class="quote">${safeMessage.replace(/\n/g, '<br>')}</div>`
        : '<p style="color: #636e72;">（沒有附帶文字訊息）</p>'}
      <p style="color: #636e72; font-size: 14px;">登入 Twogether 查看並回覆。</p>
    `;

    const htmlContent = this._activityEmailHtml({
      headerEmoji: '💌',
      headerTitle: `${safeSender} 傳了一則訊息`,
      headerSubtitle: '',
      bodyHtml,
    });

    const textContent = [
      `${senderName || '你的伴侶'} 傳了一則訊息給你${typeLabel ? `（${typeLabel}）` : ''}：`,
      message || '（沒有附帶文字訊息）',
      '',
      '打開 Twogether 查看並回覆。',
    ].join('\n');

    const mailOptions = {
      from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: `💌 ${senderName || '你的伴侶'} 傳了一則訊息給你`,
      text: textContent,
      html: htmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      logInfo('Intimacy request email sent', { kind: 'intimacy_request' });
      return result;
    } catch (error) {
      logError('Failed to send intimacy request email', { kind: 'intimacy_request', ...smtpErrorFields(error) });
      throw error;
    }
  }

  async sendIntimacyInvitationInsightsEmail({
    senderNickname,
    partnerNickname,
    partnerEmail,
    stats,
    nudgeMessage,
    nudgeReason = null,
  }) {
    if (!this.isConfigured()) {
      throw new Error('Email service is not configured');
    }

    const safeStats = stats || {};
    const weekStats = {
      accepted: safeStats.week?.accepted ?? 0,
      rejected: safeStats.week?.rejected ?? 0,
      unanswered: safeStats.week?.unanswered ?? 0,
    };
    const monthStats = {
      accepted: safeStats.month?.accepted ?? 0,
      rejected: safeStats.month?.rejected ?? 0,
      unanswered: safeStats.month?.unanswered ?? 0,
    };

    const totalMonth = monthStats.accepted + monthStats.rejected + monthStats.unanswered;
    const acceptanceRate = totalMonth > 0 ? Math.round((monthStats.accepted / totalMonth) * 100) : null;

    const reasonLabels = {
      rejected: '最近婉拒的次數偏高',
      unanswered: '最近有多次邀請尚未回覆',
      rejected_and_unanswered: '最近的邀請多次被婉拒或未回覆',
    };

    const reasonText = reasonLabels[nudgeReason] || '邀請洞察提醒';
    const safeSender = senderNickname || '你的伴侶';
    const safePartner = partnerNickname || '親愛的你';

    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>貼心邀請提醒</title>
    <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f4f5fb; }
        .container { max-width: 640px; margin: 0 auto; background-color: white; }
        .header { background: linear-gradient(135deg, #8ec5fc 0%, #e0c3fc 100%); color: #1f2933; padding: 36px 28px; text-align: left; }
        .header h1 { margin: 0; font-size: 26px; font-weight: 600; }
        .header p { margin-top: 8px; font-size: 15px; opacity: 0.9; }
        .content { padding: 32px 28px 40px; color: #1f2933; }
        .highlight { background: #fff7ed; border-radius: 16px; padding: 20px 24px; border: 1px solid #fcd34d; margin-bottom: 28px; }
        .highlight h2 { margin: 0 0 8px; font-size: 18px; color: #b45309; }
        .highlight p { margin: 0; line-height: 1.6; }
        .stats-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; border-radius: 12px; overflow: hidden; }
        .stats-table thead { background: #f8fafc; }
        .stats-table th { text-align: left; padding: 14px 16px; font-size: 14px; color: #475569; }
        .stats-table td { padding: 14px 16px; border-top: 1px solid #e2e8f0; font-size: 15px; color: #1f2933; }
        .insight-box { background: linear-gradient(135deg, #eef2ff 0%, #ede9fe 100%); padding: 20px 24px; border-radius: 16px; margin-bottom: 28px; }
        .insight-box h3 { margin: 0 0 10px; font-size: 17px; color: #4c1d95; }
        .cta { text-align: center; margin-top: 40px; }
        .cta a { display: inline-block; background: linear-gradient(135deg, #f472b6 0%, #ec4899 100%); color: white; text-decoration: none; padding: 14px 36px; border-radius: 999px; font-weight: 600; box-shadow: 0 12px 24px rgba(236, 72, 153, 0.25); transition: transform 0.2s ease; }
        .cta a:hover { transform: translateY(-2px); }
        .footer { background-color: #0f172a; color: rgba(255,255,255,0.7); padding: 24px 28px; font-size: 12px; text-align: center; }
        @media (max-width: 640px) {
            .content, .header { padding: 24px 18px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>💌 ${safeSender} 想和你聊聊彼此的感受</h1>
            <p>${safePartner}，這是一封專為你準備的貼心提醒，一起照顧你們的情感連結。</p>
        </div>
        <div class="content">
            <div class="highlight">
                <h2>${reasonText}</h2>
                <p>${nudgeMessage}</p>
            </div>

            <table class="stats-table">
                <thead>
                    <tr>
                        <th>期間</th>
                        <th>已接受</th>
                        <th>已婉拒</th>
                        <th>待回應</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>過去 7 天</td>
                        <td>${weekStats.accepted}</td>
                        <td>${weekStats.rejected}</td>
                        <td>${weekStats.unanswered}</td>
                    </tr>
                    <tr>
                        <td>過去 30 天</td>
                        <td>${monthStats.accepted}</td>
                        <td>${monthStats.rejected}</td>
                        <td>${monthStats.unanswered}</td>
                    </tr>
                </tbody>
            </table>

            <div class="insight-box">
                <h3>邀請洞察</h3>
                <p>過去一個月你們回覆了 ${monthStats.accepted + monthStats.rejected + monthStats.unanswered} 次邀請${acceptanceRate !== null ? `，整體回覆率約為 <strong>${acceptanceRate}%</strong>` : ''}。適時分享彼此的狀態與期待，能讓愛更被看見。</p>
            </div>

            <p style="line-height: 1.7; color: #475569;">試著找個舒服的時刻，與 ${safeSender} 分享你的想法或目前的狀態。坦誠的交流能讓你們的親密關係更穩固，也讓彼此更安心。</p>

            <div class="cta">
                <a href="${process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com'}">一起展開一次溫柔的對話</a>
            </div>
        </div>
        <div class="footer">
            <p>© 2024 Twogether - 陪你們把心意說出口</p>
        </div>
    </div>
</body>
</html>
    `;

    const textContentLines = [
      `親愛的 ${safePartner}，`,
      '',
      `${safeSender} 想和你一起關心最近的親密邀請：`,
      `- 過去 7 天：接受 ${weekStats.accepted} 次、婉拒 ${weekStats.rejected} 次、待回應 ${weekStats.unanswered} 次`,
      `- 過去 30 天：接受 ${monthStats.accepted} 次、婉拒 ${monthStats.rejected} 次、待回應 ${monthStats.unanswered} 次`,
      '',
      `貼心提醒：${nudgeMessage}`,
      '',
      acceptanceRate !== null ? `過去一個月的整體回覆率約為 ${acceptanceRate}%。` : '過去一個月尚未有太多邀請紀錄。',
      '找個舒服的時刻聊聊彼此的狀態，能讓你們更了解對方，也讓愛更安心。',
      '',
      '— Twogether 愛情助手'
    ];

    const mailOptions = {
      from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
      to: partnerEmail,
      subject: `💞 ${safeSender} 想和你聊聊彼此的親密時光`,
      text: textContentLines.join('\n'),
      html: htmlContent,
    };

    try {
      const result = await this.transporter.sendMail(mailOptions);
      logInfo('Intimacy nudge email sent', { kind: 'intimacy_nudge' });
      return result;
    } catch (error) {
      logError('Failed to send intimacy nudge email', { kind: 'intimacy_nudge', ...smtpErrorFields(error) });
      throw error;
    }
  }

  // Resolve the paired partner's email + opt-out status for a given user.
  // Returns null when the user is unpaired, the partner row is missing, or
  // the partner has opted out of email notifications. Callers treat null as
  // "skip silently" — no errors, no logs.
  async getPartnerEmailIfOptedIn(db, userId) {
    if (!userId) return null;
    try {
      const result = await db.query(
        `SELECT u.email, u.nickname, u.email_notifications_enabled
           FROM couples c
           JOIN users u ON u.id = CASE
             WHEN c.user1_id = $1 THEN c.user2_id ELSE c.user1_id END
          WHERE (c.user1_id = $1 OR c.user2_id = $1)
            AND c.user2_id IS NOT NULL`,
        [userId]
      );
      const row = result.rows[0];
      if (!row || !row.email_notifications_enabled || !row.email) return null;
      return { email: row.email, nickname: row.nickname };
    } catch (err) {
      logWarn('getPartnerEmailIfOptedIn failed', { err: err.message });
      return null;
    }
  }

  // Resolve a specific user's email + opt-out status. Used when the target
  // is not the partner-of-the-actor (e.g. intimacy response → email original
  // requester directly by user id).
  async getUserEmailIfOptedIn(db, userId) {
    if (!userId) return null;
    try {
      const result = await db.query(
        `SELECT email, nickname, email_notifications_enabled
           FROM users WHERE id = $1`,
        [userId]
      );
      const row = result.rows[0];
      if (!row || !row.email_notifications_enabled || !row.email) return null;
      return { email: row.email, nickname: row.nickname };
    } catch (err) {
      logWarn('getUserEmailIfOptedIn failed', { err: err.message });
      return null;
    }
  }

  // Relationship-cultivation reminder (check-in due / intimacy gap / appreciation
  // gap). Fired from GET /api/relationship/summary when a signal is overdue and
  // past its cooldown. Respects the email opt-in (caller uses getUserEmailIfOptedIn).
  async sendRelationshipReminder({ recipientEmail, recipientName, kind, days }) {
    if (!this.isConfigured() || !recipientEmail) return;
    const name = this._escape(recipientName || '');
    const map = {
      checkin_due: {
        emoji: '🏡', title: '本週的關係檢視', subtitle: '花兩分鐘，照顧你們的關係之屋',
        body: `<p>嗨 ${name}，</p><p>已經一陣子沒做<strong>關係檢視</strong>了。花兩分鐘為「信賴」「奉獻」「連結」打個分數，能幫你們及早看見需要照顧的地方。</p>`,
        cta: '🏡 開始本週檢視',
      },
      intimacy_gap: {
        emoji: '💗', title: '好久沒有親密了', subtitle: '給彼此一點靠近的時間',
        body: `<p>嗨 ${name}，</p><p>你們已經 <strong>${days} 天</strong>沒有記錄親密時光了。主動關心一下另一半，傳個親密邀請吧。</p>`,
        cta: '💗 傳個邀請',
      },
      appreciation_gap: {
        emoji: '🌱', title: '存一筆好感吧', subtitle: '正向的話語，是關係的存款',
        body: `<p>嗨 ${name}，</p><p>這陣子還沒對 TA 說一句欣賞的話。一句真誠的稱讚，就是替你們的關係「存好感」，讓日後的衝突更容易化解。</p>`,
        cta: '🌱 寫一句稱讚',
      },
    };
    const m = map[kind] || map.checkin_due;
    const html = this._activityEmailHtml({
      headerEmoji: m.emoji, headerTitle: m.title, headerSubtitle: m.subtitle,
      bodyHtml: m.body, ctaLabel: m.cta,
    });
    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: `${m.emoji} ${m.title}`,
        html,
        text: `${m.title}\n\n登入 Twogether 查看。`,
      });
    } catch (err) {
      logWarn('sendRelationshipReminder failed', { err: err.message, kind });
    }
  }

  // Shared lightweight HTML wrapper used by the partner-activity emails so
  // we don't repeat 100 lines of CSS per template.
  _activityEmailHtml({ headerEmoji, headerTitle, headerSubtitle, bodyHtml, ctaLabel = '💕 打開 Twogether 查看', ctaUrl }) {
    const frontendUrl = ctaUrl || process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com';
    return `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${headerTitle}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background-color: white; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 32px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 400; }
    .header p { margin: 6px 0 0; opacity: 0.85; font-size: 14px; }
    .content { padding: 32px 20px; color: #2d3436; line-height: 1.6; }
    .quote { background: #f8f9fa; border-left: 4px solid #e17055; padding: 16px 20px; border-radius: 8px; margin: 16px 0; color: #2d3436; }
    .cta-button { display: inline-block; background: linear-gradient(135deg, #00b894 0%, #00cec9 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 25px; font-weight: bold; }
    .cta-wrap { text-align: center; margin-top: 28px; }
    .footer { background-color: #2d3436; color: white; padding: 20px; text-align: center; font-size: 12px; opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${headerEmoji} ${headerTitle}</h1>
      ${headerSubtitle ? `<p>${headerSubtitle}</p>` : ''}
    </div>
    <div class="content">
      ${bodyHtml}
      <div class="cta-wrap">
        <a href="${frontendUrl}" class="cta-button">${ctaLabel}</a>
      </div>
    </div>
    <div class="footer">
      <p>© 2024 Twogether</p>
      <p>如果你不想收到此類郵件，請在應用內調整通知設定。</p>
    </div>
  </div>
</body>
</html>`;
  }

  _escape(text = '') {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async sendWallPostNotification({ senderName, recipientEmail, isImportant = false, isReply = false, content = '' }) {
    if (!this.isConfigured()) return;
    if (!recipientEmail) return;

    const safeSender = this._escape(senderName || '你的伴侶');
    const safeContent = this._escape(content).slice(0, 600);
    const headerTitle = isReply
      ? '伴侶回覆了你的貼文'
      : (isImportant ? '伴侶留下了重要的話 ⭐' : '伴侶在牆上留言');
    const subject = isReply
      ? `💬 ${senderName || '你的伴侶'} 回覆了你的貼文`
      : (isImportant
        ? `⭐ ${senderName || '你的伴侶'} 留下了重要的話`
        : `💌 ${senderName || '你的伴侶'} 在牆上留言`);

    const bodyHtml = `
      <p><strong>${safeSender}</strong> ${isReply ? '回覆了你的貼文：' : '在你們的牆上留下了訊息：'}</p>
      <div class="quote">${safeContent.replace(/\n/g, '<br>')}</div>
      <p style="color: #636e72; font-size: 14px;">登入 Twogether 查看完整內容並回覆。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: isImportant ? '⭐' : '💌',
      headerTitle,
      headerSubtitle: '你的伴侶想和你分享一些事',
      bodyHtml,
    });

    const text = [
      `${senderName || '你的伴侶'} ${isReply ? '回覆了你的貼文' : '在牆上留言'}：`,
      content || '',
      '',
      '打開 Twogether 查看完整內容。',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject,
        text,
        html,
      });
      logInfo('Wall email sent', { kind: isReply ? 'wall_reply' : 'wall_post' });
    } catch (error) {
      logError('Failed to send wall email', { kind: isReply ? 'wall_reply' : 'wall_post', ...smtpErrorFields(error) });
    }
  }

  async sendEventNotification({ senderName, recipientEmail, eventTitle = '', type }) {
    if (!this.isConfigured()) return;
    if (!recipientEmail) return;

    const safeSender = this._escape(senderName || '你的伴侶');
    const safeTitle = this._escape(eventTitle).slice(0, 200);

    const meta = {
      event_created:        { emoji: '📣', headline: '伴侶開啟了一個事件',         subject: `📣 ${senderName || '你的伴侶'} 開啟了一個事件` },
      event_reply:          { emoji: '💬', headline: '伴侶在事件中回覆',           subject: `💬 ${senderName || '你的伴侶'} 在事件中回覆了` },
      event_resolve_request:{ emoji: '🤝', headline: '伴侶希望標記事件為已解決',   subject: `🤝 ${senderName || '你的伴侶'} 希望標記事件為已解決` },
      event_resolved:       { emoji: '✅', headline: '事件已解決',                  subject: `✅ 事件已解決` },
    }[type] || { emoji: '🔔', headline: '事件更新', subject: '🔔 事件更新' };

    const bodyHtml = `
      <p>${meta.headline}：</p>
      <div class="quote"><strong>${safeTitle || '(無標題)'}</strong></div>
      <p style="color: #636e72; font-size: 14px;">登入 Twogether 查看事件詳情。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: meta.emoji,
      headerTitle: meta.headline,
      headerSubtitle: safeSender,
      bodyHtml,
    });

    const text = [
      `${meta.headline}`,
      `事件：${eventTitle || '(無標題)'}`,
      '',
      '打開 Twogether 查看事件詳情。',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: meta.subject,
        text,
        html,
      });
      logInfo('Event email sent', { kind: 'event', type });
    } catch (error) {
      logError('Failed to send event email', { kind: 'event', type, ...smtpErrorFields(error) });
    }
  }

  // Send a therapist their email-verification link after they sign up. The
  // link points at the public GET /api/therapists/verify-email?token=… route,
  // which flips email_verified true and shows a confirmation page.
  async sendTherapistEmailVerification({ recipientEmail, displayName, token }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping therapist verification email', { kind: 'therapist_verify' });
      return;
    }
    if (!recipientEmail || !token) return;

    const frontendUrl = process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com';
    const verifyUrl = `${frontendUrl}/api/therapists/verify-email?token=${encodeURIComponent(token)}`;
    const safeName = this._escape(displayName || '諮商師');

    const bodyHtml = `
      <p>${safeName} 你好，</p>
      <p>感謝你申請成為 Twogether 平台的諮商心理師。請點擊下方按鈕驗證這個 Email 是你本人的，我們才能在審核通過後與你聯繫。</p>
      <p style="color:#636e72;font-size:14px;">如果按鈕無法點擊，請複製以下連結到瀏覽器：<br>
        <code style="background:#f8f9fa;padding:4px 6px;border-radius:4px;word-break:break-all;">${verifyUrl}</code>
      </p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🩺',
      headerTitle: '驗證你的 Email',
      headerSubtitle: 'Twogether 心理諮商',
      bodyHtml,
      ctaLabel: '✓ 驗證我的 Email',
    }).replace(
      process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com',
      verifyUrl
    );

    const text = [
      `${displayName || '諮商師'} 你好，`,
      '',
      '感謝你申請成為 Twogether 平台的諮商心理師。',
      '請點擊以下連結驗證你的 Email：',
      verifyUrl,
      '',
      '— Twogether 心理諮商',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 心理諮商" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🩺 請驗證你的 Email · Twogether 諮商師申請',
        text,
        html,
      });
      logInfo('Therapist verification email sent', { kind: 'therapist_verify' });
    } catch (error) {
      logError('Failed to send therapist verification email', { kind: 'therapist_verify', ...smtpErrorFields(error) });
    }
  }

  async sendIntimacyResponseNotification({ receiverName, senderEmail, response, responseMessage = '' }) {
    if (!this.isConfigured()) return;
    if (!senderEmail) return;

    const accepted = response === 'accepted';
    const safeReceiver = this._escape(receiverName || '你的伴侶');
    const safeMessage = this._escape(responseMessage).slice(0, 600);
    const headerTitle = accepted ? '邀請被接受 💕' : '邀請被婉拒';
    const subject = accepted
      ? `💕 ${receiverName || '你的伴侶'} 接受了你的親密邀請`
      : `💌 ${receiverName || '你的伴侶'} 回覆了你的親密邀請`;

    const bodyHtml = accepted
      ? `<p><strong>${safeReceiver}</strong> 接受了你的親密邀請！</p>
         ${safeMessage ? `<div class="quote">${safeMessage.replace(/\n/g, '<br>')}</div>` : ''}
         <p style="color: #636e72; font-size: 14px;">登入 Twogether 安排你們的時光。</p>`
      : `<p><strong>${safeReceiver}</strong> 暫時婉拒了你的親密邀請。</p>
         ${safeMessage ? `<div class="quote">${safeMessage.replace(/\n/g, '<br>')}</div>` : ''}
         <p style="color: #636e72; font-size: 14px;">沒關係，再找一個合適的時刻溝通也很好。</p>`;

    const html = this._activityEmailHtml({
      headerEmoji: accepted ? '💕' : '💌',
      headerTitle,
      headerSubtitle: accepted ? '你們的時光就要開始了' : '溫柔地給彼此空間',
      bodyHtml,
    });

    const text = [
      accepted
        ? `${receiverName || '你的伴侶'} 接受了你的親密邀請！`
        : `${receiverName || '你的伴侶'} 暫時婉拒了你的親密邀請。`,
      responseMessage ? `訊息：${responseMessage}` : '',
      '',
      '打開 Twogether 查看詳情。',
    ].filter(Boolean).join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: senderEmail,
        subject,
        text,
        html,
      });
      logInfo('Intimacy response email sent', { kind: 'intimacy_response', response });
    } catch (error) {
      logError('Failed to send intimacy response email', { kind: 'intimacy_response', response, ...smtpErrorFields(error) });
    }
  }

  _appBaseUrl() {
    return (process.env.FRONTEND_URL || 'https://twogether-couples-app.de.r.appspot.com').replace(/\/$/, '');
  }

  // Welcome + email verification, sent on sign-up. One email, not two: it
  // greets the new user and asks them to confirm their address via the button.
  async sendWelcomeEmail({ recipientEmail, nickname, token }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping welcome email', { kind: 'welcome' });
      return;
    }
    if (!recipientEmail) return;

    const safeName = this._escape(nickname || '你好');
    const verifyUrl = token
      ? `${this._appBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`
      : this._appBaseUrl();

    const bodyHtml = `
      <p>${safeName}，歡迎加入 <strong>Twogether</strong> 💕</p>
      <p>這裡是專屬於你們倆的小天地 — 記錄親密時光、玩情趣遊戲、化解爭執、收藏劇本。</p>
      ${token ? `
      <p>為了確保是你本人，請點下方按鈕完成 Email 驗證：</p>
      <p style="color:#636e72;font-size:14px;">如果按鈕無法點擊，請複製以下連結到瀏覽器：<br>
        <code style="background:#f8f9fa;padding:4px 6px;border-radius:4px;word-break:break-all;">${verifyUrl}</code>
      </p>` : ''}
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🎉',
      headerTitle: '歡迎加入 Twogether',
      headerSubtitle: token ? '還差一步：驗證你的 Email' : '',
      bodyHtml,
      ctaLabel: token ? '✓ 驗證我的 Email' : '💕 打開 Twogether',
      ctaUrl: verifyUrl,
    });

    const text = [
      `${nickname || '你好'}，歡迎加入 Twogether！`,
      '',
      token ? `請點擊以下連結完成 Email 驗證：\n${verifyUrl}` : '打開 Twogether 開始記錄你們的時光。',
      '',
      '— Twogether',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🎉 歡迎加入 Twogether！請驗證你的 Email',
        text,
        html,
      });
      logInfo('Welcome email sent', { kind: 'welcome' });
    } catch (error) {
      logError('Failed to send welcome email', { kind: 'welcome', ...smtpErrorFields(error) });
    }
  }

  // Password reset link. Caller guarantees the token + expiry are stored.
  async sendPasswordResetEmail({ recipientEmail, nickname, token }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping password reset email', { kind: 'password_reset' });
      return;
    }
    if (!recipientEmail || !token) return;

    const safeName = this._escape(nickname || '你好');
    const resetUrl = `${this._appBaseUrl()}/api/auth/reset-password?token=${encodeURIComponent(token)}`;

    const bodyHtml = `
      <p>${safeName}，</p>
      <p>我們收到重設你 Twogether 密碼的請求。點下方按鈕設定新密碼，連結 <strong>1 小時內</strong>有效。</p>
      <p style="color:#636e72;font-size:14px;">如果這不是你本人操作，請忽略這封信，你的密碼不會變更。</p>
      <p style="color:#636e72;font-size:14px;">按鈕無法點擊時，請複製連結：<br>
        <code style="background:#f8f9fa;padding:4px 6px;border-radius:4px;word-break:break-all;">${resetUrl}</code>
      </p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🔑',
      headerTitle: '重設你的密碼',
      headerSubtitle: 'Twogether 帳號安全',
      bodyHtml,
      ctaLabel: '🔑 設定新密碼',
      ctaUrl: resetUrl,
    });

    const text = [
      `${nickname || '你好'}，`,
      '',
      '我們收到重設你 Twogether 密碼的請求。',
      '請點擊以下連結設定新密碼（1 小時內有效）：',
      resetUrl,
      '',
      '如果這不是你本人操作，請忽略這封信。',
      '',
      '— Twogether',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🔑 重設你的 Twogether 密碼',
        text,
        html,
      });
      logInfo('Password reset email sent', { kind: 'password_reset' });
    } catch (error) {
      logError('Failed to send password reset email', { kind: 'password_reset', ...smtpErrorFields(error) });
    }
  }

  // Confirmation link sent to the NEW address when a user changes their login
  // email. Clicking it is what actually swaps users.email (see
  // GET /api/auth/confirm-email-change). Caller guarantees the token is stored.
  async sendEmailChangeVerification({ recipientEmail, nickname, token }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping email-change verification', { kind: 'email_change_verify' });
      return;
    }
    if (!recipientEmail || !token) return;

    const safeName = this._escape(nickname || '你好');
    const confirmUrl = `${this._appBaseUrl()}/api/auth/confirm-email-change?token=${encodeURIComponent(token)}`;

    const bodyHtml = `
      <p>${safeName}，</p>
      <p>我們收到把這個信箱設為你 Twogether 登入 Email 的請求。點下方按鈕完成變更：</p>
      <p style="color:#636e72;font-size:14px;">在你點擊確認前，原本的 Email 仍可正常登入。如果這不是你本人操作，請忽略這封信，登入 Email 不會變更。</p>
      <p style="color:#636e72;font-size:14px;">按鈕無法點擊時，請複製連結：<br>
        <code style="background:#f8f9fa;padding:4px 6px;border-radius:4px;word-break:break-all;">${confirmUrl}</code>
      </p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '✉️',
      headerTitle: '確認你的新登入 Email',
      headerSubtitle: 'Twogether 帳號安全',
      bodyHtml,
      ctaLabel: '✓ 確認變更 Email',
      ctaUrl: confirmUrl,
    });

    const text = [
      `${nickname || '你好'}，`,
      '',
      '我們收到把這個信箱設為你 Twogether 登入 Email 的請求。',
      '請點擊以下連結完成變更：',
      confirmUrl,
      '',
      '在你點擊確認前，原本的 Email 仍可正常登入。如果這不是你本人操作，請忽略這封信。',
      '',
      '— Twogether',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '✉️ 確認你的新 Twogether 登入 Email',
        text,
        html,
      });
      logInfo('Email-change verification sent', { kind: 'email_change_verify' });
    } catch (error) {
      logError('Failed to send email-change verification', { kind: 'email_change_verify', ...smtpErrorFields(error) });
    }
  }

  // Heads-up to the OLD address when an email change is requested, so a user
  // notices (and can reset their password) if someone else triggered it.
  async sendEmailChangeRequestedNotice({ recipientEmail, nickname, newEmail }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping email-change notice', { kind: 'email_change_notice' });
      return;
    }
    if (!recipientEmail) return;

    const safeName = this._escape(nickname || '你好');
    const safeNewEmail = this._escape(newEmail || '');

    const bodyHtml = `
      <p>${safeName}，</p>
      <p>我們收到把你 Twogether 登入 Email 變更為 <strong>${safeNewEmail}</strong> 的請求。</p>
      <p>變更需要在新信箱點擊確認連結後才會生效。在那之前，這個信箱仍然是你的登入 Email。</p>
      <p style="color:#636e72;font-size:14px;">如果這不是你本人操作，請立即<strong>重設你的密碼</strong>以保護帳號安全。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🔔',
      headerTitle: '有人要求變更你的登入 Email',
      headerSubtitle: 'Twogether 帳號安全',
      bodyHtml,
      ctaLabel: '🔑 前往 Twogether',
      ctaUrl: this._appBaseUrl(),
    });

    const text = [
      `${nickname || '你好'}，`,
      '',
      `我們收到把你 Twogether 登入 Email 變更為 ${newEmail} 的請求。`,
      '變更需要在新信箱點擊確認連結後才會生效。',
      '',
      '如果這不是你本人操作，請立即重設你的密碼以保護帳號安全。',
      '',
      '— Twogether',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🔔 有人要求變更你的 Twogether 登入 Email',
        text,
        html,
      });
      logInfo('Email-change notice sent to old address', { kind: 'email_change_notice' });
    } catch (error) {
      logError('Failed to send email-change notice', { kind: 'email_change_notice', ...smtpErrorFields(error) });
    }
  }

  // Purchase receipt after a successful Premium payment. Sent to the buyer.
  async sendPaymentReceiptEmail({ recipientEmail, nickname, planLabel, amountTwd, days, orderNo, paidAt, expiresAt }) {
    if (!this.isConfigured()) {
      logWarn('Email service not configured; skipping receipt email', { kind: 'payment_receipt' });
      return;
    }
    if (!recipientEmail) return;

    const safeName = this._escape(nickname || '你好');
    const fmtDate = (d) => {
      try { return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' }); }
      catch { return String(d ?? ''); }
    };
    const rows = [
      ['方案', this._escape(planLabel || 'Premium')],
      ['天數', `${days} 天`],
      ['金額', `NT$ ${amountTwd}`],
      ['訂單編號', this._escape(orderNo || '')],
      ['付款時間', fmtDate(paidAt || Date.now())],
      ['有效期限至', fmtDate(expiresAt)],
    ].map(([k, v]) => `
      <tr>
        <td style="padding:8px 12px;color:#636e72;border-bottom:1px solid #eee;">${k}</td>
        <td style="padding:8px 12px;color:#2d3436;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${v}</td>
      </tr>`).join('');

    const bodyHtml = `
      <p>${safeName}，感謝你升級 <strong>Twogether Premium</strong> 💛 這是你的購買收據：</p>
      <table style="width:100%;border-collapse:collapse;background:#f8f9fa;border-radius:8px;overflow:hidden;margin:16px 0;">
        ${rows}
      </table>
      <p style="color:#636e72;font-size:14px;">Premium 為情侶共用，你的伴侶也會一起享有。如需協助請回覆 support 信箱。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🧾',
      headerTitle: '購買收據',
      headerSubtitle: 'Twogether Premium',
      bodyHtml,
      ctaLabel: '💛 查看我的方案',
      ctaUrl: `${this._appBaseUrl()}/`,
    });

    const text = [
      `${nickname || '你好'}，感謝你升級 Twogether Premium！`,
      '',
      `方案：${planLabel || 'Premium'}（${days} 天）`,
      `金額：NT$ ${amountTwd}`,
      `訂單編號：${orderNo || ''}`,
      `付款時間：${fmtDate(paidAt || Date.now())}`,
      `有效期限至：${fmtDate(expiresAt)}`,
      '',
      'Premium 為情侶共用，你的伴侶也會一起享有。',
      '— Twogether',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🧾 Twogether Premium 購買收據',
        text,
        html,
      });
      logInfo('Payment receipt email sent', { kind: 'payment_receipt' });
    } catch (error) {
      logError('Failed to send payment receipt email', { kind: 'payment_receipt', ...smtpErrorFields(error) });
    }
  }

  // First-time consultation booking: notify the therapist there's a new case.
  // Subsequent chat messages do NOT email — they create in-app notifications.
  async sendConsultationRequestToTherapist({ recipientEmail, therapistName, clientName, focusArea, message }) {
    if (!this.isConfigured() || !recipientEmail) return;

    const safeTherapist = this._escape(therapistName || '諮商師');
    const safeClient = this._escape(clientName || '一位使用者');
    const safeFocus = this._escape(focusArea || '');
    const safeMessage = this._escape(message || '').slice(0, 600);

    const bodyHtml = `
      <p>${safeTherapist} 你好，</p>
      <p><strong>${safeClient}</strong> 透過 Twogether 向你預約了諮商${safeFocus ? `（主題：${safeFocus}）` : ''}。</p>
      ${safeMessage ? `<div class="quote">${safeMessage.replace(/\n/g, '<br>')}</div>` : ''}
      <p style="color:#636e72;font-size:14px;">登入 Twogether 查看並回覆。之後的對話只會出現在 App 內，不會再寄 Email。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🗓️',
      headerTitle: '你有一則新的諮商預約',
      headerSubtitle: safeClient,
      bodyHtml,
    });

    const text = [
      `${therapistName || '諮商師'} 你好，`,
      `${clientName || '一位使用者'} 透過 Twogether 向你預約了諮商${focusArea ? `（主題：${focusArea}）` : ''}。`,
      message ? `\n訊息：${message}` : '',
      '',
      '登入 Twogether 查看並回覆。之後的對話只會出現在 App 內。',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 心理諮商" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: `🗓️ ${clientName || '有人'} 向你預約了諮商`,
        text,
        html,
      });
      logInfo('Consultation request email sent', { kind: 'consultation_request' });
    } catch (error) {
      logError('Failed to send consultation request email', { kind: 'consultation_request', ...smtpErrorFields(error) });
    }
  }

  // First-time consultation booking: confirm to the user that it went through.
  async sendConsultationBookingConfirmation({ recipientEmail, clientName, therapistName }) {
    if (!this.isConfigured() || !recipientEmail) return;

    const safeClient = this._escape(clientName || '你好');
    const safeTherapist = this._escape(therapistName || '諮商師');

    const bodyHtml = `
      <p>${safeClient}，</p>
      <p>你向 <strong>${safeTherapist}</strong> 的諮商預約已送出，對方會盡快與你聯繫。</p>
      <p style="color:#636e72;font-size:14px;">之後諮商室的對話會以 App 內通知提醒你，不會再寄 Email。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '🗓️',
      headerTitle: '你的諮商預約已送出',
      headerSubtitle: safeTherapist,
      bodyHtml,
      ctaLabel: '💬 進入諮商室',
    });

    const text = [
      `${clientName || '你好'}，`,
      `你向 ${therapistName || '諮商師'} 的諮商預約已送出，對方會盡快與你聯繫。`,
      '',
      '之後諮商室的對話會以 App 內通知提醒你，不會再寄 Email。',
      '— Twogether 心理諮商',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 心理諮商" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: '🗓️ 你的諮商預約已送出',
        text,
        html,
      });
      logInfo('Consultation confirmation email sent', { kind: 'consultation_confirm' });
    } catch (error) {
      logError('Failed to send consultation confirmation email', { kind: 'consultation_confirm', ...smtpErrorFields(error) });
    }
  }

  // A user shares one of their custom role scripts with their partner to spark
  // interest. Deliberately light on detail — the point is to nudge the partner
  // to log in and take a look, not to reproduce the script in the email.
  async sendScriptShareEmail({ recipientEmail, sharerName, scriptTitle, scenario }) {
    if (!this.isConfigured() || !recipientEmail) return;

    const safeSharer = this._escape(sharerName || '你的伴侶');
    const safeTitle = this._escape(scriptTitle || '一個劇本');
    const safeScenario = this._escape(scenario || '').slice(0, 300);

    const bodyHtml = `
      <p><strong>${safeSharer}</strong> 想和你一起試試這個角色扮演劇本 💕</p>
      <div class="quote">
        <div style="font-weight:600;font-size:16px;">${safeTitle}</div>
        ${safeScenario ? `<div style="color:#636e72;margin-top:6px;">${safeScenario}</div>` : ''}
      </div>
      <p style="color:#636e72;font-size:14px;">登入 Twogether 看看完整劇本，準備好給對方一個驚喜。</p>
    `;
    const html = this._activityEmailHtml({
      headerEmoji: '💌',
      headerTitle: `${safeSharer} 想和你試試一個劇本`,
      headerSubtitle: safeTitle,
      bodyHtml,
      ctaLabel: '💕 登入查看劇本',
    });

    const text = [
      `${sharerName || '你的伴侶'} 想和你一起試試這個角色扮演劇本：`,
      `「${scriptTitle || '一個劇本'}」`,
      scenario ? `\n${scenario}` : '',
      '',
      '登入 Twogether 看看完整劇本。',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: `"Twogether 愛情助手" <${process.env.SMTP_USER}>`,
        to: recipientEmail,
        subject: `💌 ${sharerName || '你的伴侶'} 想和你試試「${scriptTitle || '一個劇本'}」`,
        text,
        html,
      });
      logInfo('Script share email sent', { kind: 'script_share' });
    } catch (error) {
      logError('Failed to send script share email', { kind: 'script_share', ...smtpErrorFields(error) });
    }
  }
}

module.exports = new EmailService();
