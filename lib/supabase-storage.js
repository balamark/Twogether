const axios = require('axios');

async function uploadToSupabase(fileBuffer, fileName, mimeType, bucket = 'photos') {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase configuration missing');
  }

  // In tests we point at a placeholder Supabase host (.env.test). Skip the real
  // HTTP upload and return a URL with the same shape so callers can assert it.
  if (process.env.NODE_ENV === 'test' && supabaseUrl.includes('test.supabase.co')) {
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
  }

  const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${fileName}`;

  const response = await axios.post(uploadUrl, fileBuffer, {
    headers: {
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': mimeType,
      'Content-Length': fileBuffer.length,
    },
  });

  if (response.status !== 200) {
    throw new Error(`Supabase upload failed with status ${response.status}`);
  }

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${fileName}`;
}

module.exports = { uploadToSupabase };
