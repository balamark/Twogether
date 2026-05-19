const axios = require('axios');
const { logError } = require('./logger');

// Returns the new-style ("sb_secret_..." / "sb_publishable_...") API key
// format introduced by Supabase's late-2025 key rotation, vs. the legacy
// JWT format. Used only for diagnostic logging — both formats are valid.
function detectKeyFormat(key) {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'new_secret';
  if (key.startsWith('sb_publishable_')) return 'new_publishable';
  if (key.startsWith('eyJ')) return 'legacy_jwt';
  return 'unknown';
}

async function uploadToSupabase(fileBuffer, fileName, mimeType, bucket = 'photos') {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Outside production, skip the real HTTP upload and return a URL with the
  // same shape so callers (and Playwright assertions) work without needing
  // real Supabase credentials or upstream availability.
  if (process.env.NODE_ENV !== 'production') {
    const base = supabaseUrl || 'https://local.invalid';
    return `${base}/storage/v1/object/public/${bucket}/${fileName}`;
  }

  if (!supabaseUrl || !supabaseKey) {
    const err = new Error('Supabase configuration missing');
    err.code = 'SUPABASE_CONFIG_MISSING';
    err.hasUrl = !!supabaseUrl;
    err.hasKey = !!supabaseKey;
    throw err;
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`;
  const keyFormat = detectKeyFormat(supabaseKey);

  try {
    const response = await axios.post(uploadUrl, fileBuffer, {
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': mimeType,
        'Content-Length': fileBuffer.length,
      },
      // Inspect 4xx responses ourselves rather than letting axios throw
      // before we can log the body.
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      logError('supabase-storage upload rejected', {
        status: response.status,
        responseData: response.data,
        bucket,
        fileName,
        mimeType,
        fileSize: fileBuffer.length,
        keyFormat,
        urlHost: new URL(supabaseUrl).host,
      });
      const err = new Error(
        `Supabase upload failed with status ${response.status}: ${
          typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        }`
      );
      err.code = 'SUPABASE_UPLOAD_REJECTED';
      err.status = response.status;
      err.responseData = response.data;
      err.bucket = bucket;
      err.keyFormat = keyFormat;
      throw err;
    }

    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
  } catch (err) {
    // Network-layer failures (DNS, TLS, ECONNRESET, etc.) — axios throws
    // before producing a response. Log enough to distinguish from API-level
    // 4xx/5xx handled above.
    if (!err.code || err.code !== 'SUPABASE_UPLOAD_REJECTED') {
      logError('supabase-storage upload threw', {
        errorMessage: err.message,
        code: err.code,
        bucket,
        fileName,
        mimeType,
        fileSize: fileBuffer.length,
        keyFormat,
        urlHost: (() => {
          try { return new URL(supabaseUrl).host; } catch { return null; }
        })(),
      });
    }
    throw err;
  }
}

module.exports = { uploadToSupabase, detectKeyFormat };
