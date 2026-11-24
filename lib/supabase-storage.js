const axios = require('axios');
const { logError, logInfo } = require('./logger');

function detectKeyFormat(key) {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'new_secret';
  if (key.startsWith('sb_publishable_')) return 'new_publishable';
  if (key.startsWith('eyJ')) return 'legacy_jwt';
  return 'unknown';
}

function storageHeaders(supabaseKey, keyFormat, contentType) {
  const headers = { apikey: supabaseKey, 'Content-Type': contentType };
  if (keyFormat === 'legacy_jwt') headers.Authorization = `Bearer ${supabaseKey}`;
  return headers;
}

function isBucketNotFound(response) {
  const d = response && response.data;
  if (!d) return false;
  const text = typeof d === 'string' ? d : JSON.stringify(d);
  return /bucket not found/i.test(text);
}

async function ensureBucket(supabaseUrl, supabaseKey, keyFormat, bucket, isPublic = true) {
  const response = await axios.post(
    `${supabaseUrl}/storage/v1/bucket`,
    { id: bucket, name: bucket, public: isPublic },
    { headers: storageHeaders(supabaseKey, keyFormat, 'application/json'), validateStatus: () => true }
  );
  const ok = response.status >= 200 && response.status < 300;
  const alreadyExists = !ok && /already exists/i.test(
    typeof response.data === 'string' ? response.data : JSON.stringify(response.data || '')
  );
  if (!ok && !alreadyExists) {
    logError('supabase-storage ensureBucket failed', { status: response.status, responseData: response.data, bucket });
    const err = new Error(`Failed to create bucket "${bucket}" (status ${response.status})`);
    err.code = 'SUPABASE_BUCKET_CREATE_FAILED';
    throw err;
  }
  logInfo('supabase-storage bucket ready', { bucket, created: ok, alreadyExists });
}

const STORAGE_REF_PREFIX = 'storage://';
const toStorageRef = (bucket, fileName) => `${STORAGE_REF_PREFIX}${bucket}/${fileName}`;
function parseStorageRef(ref) {
  if (typeof ref !== 'string' || !ref.startsWith(STORAGE_REF_PREFIX)) return null;
  const rest = ref.slice(STORAGE_REF_PREFIX.length);
  const slash = rest.indexOf('/');
  if (slash <= 0 || slash === rest.length - 1) return null;
  return { bucket: rest.slice(0, slash), fileName: rest.slice(slash + 1) };
}

async function uploadToSupabase(fileBuffer, fileName, mimeType, bucket = 'photos', { isPublic = true } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (process.env.NODE_ENV !== 'production') {
    if (!isPublic) return toStorageRef(bucket, fileName);
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

  const headers = {
    ...storageHeaders(supabaseKey, keyFormat, mimeType),
    'Content-Length': fileBuffer.length,
    'cache-control': 'max-age=31536000',
  };

  const doUpload = () => axios.post(uploadUrl, fileBuffer, { headers, validateStatus: () => true });

  try {
    let response = await doUpload();

    if ((response.status < 200 || response.status >= 300) && isBucketNotFound(response)) {
      logInfo('supabase-storage bucket missing; creating then retrying', { bucket, fileName });
      await ensureBucket(supabaseUrl, supabaseKey, keyFormat, bucket, isPublic);
      response = await doUpload();
    }

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

    if (!isPublic) return toStorageRef(bucket, fileName);
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
  } catch (err) {
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

async function createSignedUrl(ref, expiresInSeconds = 300) {
  const parsed = parseStorageRef(ref);
  if (!parsed) {
    const err = new Error('Not a storage reference');
    err.code = 'STORAGE_REF_INVALID';
    throw err;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const objectPath = `${encodeURIComponent(parsed.bucket)}/${parsed.fileName.split('/').map(encodeURIComponent).join('/')}`;
  if (process.env.NODE_ENV !== 'production') {
    return `${supabaseUrl || 'https://local.invalid'}/storage/v1/object/sign/${objectPath}?token=dev`;
  }
  if (!supabaseUrl || !supabaseKey) {
    const err = new Error('Supabase configuration missing');
    err.code = 'SUPABASE_CONFIG_MISSING';
    throw err;
  }
  const keyFormat = detectKeyFormat(supabaseKey);
  const response = await axios.post(
    `${supabaseUrl}/storage/v1/object/sign/${objectPath}`,
    { expiresIn: expiresInSeconds },
    { headers: storageHeaders(supabaseKey, keyFormat, 'application/json'), validateStatus: () => true }
  );
  const signed = response.data && (response.data.signedURL || response.data.signedUrl);
  if (response.status < 200 || response.status >= 300 || !signed) {
    logError('supabase-storage sign failed', { status: response.status, responseData: response.data, bucket: parsed.bucket });
    const err = new Error(`Supabase sign failed with status ${response.status}`);
    err.code = 'SUPABASE_SIGN_FAILED';
    err.status = response.status;
    throw err;
  }
  return /^https?:\/\//.test(signed) ? signed : `${supabaseUrl}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}`;
}

module.exports = {
  uploadToSupabase,
  detectKeyFormat,
  ensureBucket,
  createSignedUrl,
  parseStorageRef,
  toStorageRef,
};
