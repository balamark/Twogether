// Minimal self-contained HTML page (no SPA needed) for the links we email:
// email verification, login-email change confirmation, and one-click
// unsubscribe. Extracted from routes/auth.js so every emailed link lands on
// the same styling instead of each route inventing its own.

const renderEmailPage = (res, { ok = true, status = 200, emoji, title, message, body = '' }) => {
  res.status(status).type('html').send(`<!doctype html><html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Twogether</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;background:#fbf7f2;color:#2a2422;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px}
.card{background:#fff;border:1px solid #e4dccf;border-radius:14px;padding:36px 32px;max-width:420px;width:100%;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.emoji{font-size:44px}h1{font-size:22px;font-weight:500;margin:14px 0 8px}p{color:#8a807c;font-size:15px;line-height:1.6;margin:0 0 20px}
input{width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #e4dccf;border-radius:8px;font-size:15px;margin:6px 0}
button,a.btn{display:inline-block;background:#2a2422;color:#fbf7f2;border:0;text-decoration:none;padding:11px 22px;border-radius:8px;font-size:14px;cursor:pointer}</style>
</head><body><div class="card"><div class="emoji">${emoji ?? (ok ? '✅' : '⚠️')}</div>
<h1>${title}</h1><p>${message}</p>${body}</div></body></html>`);
};

module.exports = { renderEmailPage };
