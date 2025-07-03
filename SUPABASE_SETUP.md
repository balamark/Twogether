# Supabase Storage Setup Guide

This guide will help you set up Supabase Storage for photo uploads in the Twogether app.

## Why Supabase?

We moved from database BLOB storage to Supabase Storage because:
- ✅ Avoids Docker compilation issues with Rust dependencies
- ✅ Better performance for serving images
- ✅ Built-in CDN and optimization
- ✅ Easier to scale and manage
- ✅ Free tier with generous limits

## Setup Steps

### 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Choose your organization
5. Fill in project details:
   - **Name**: `twogether-photos` (or any name you prefer)
   - **Database Password**: Generate a strong password
   - **Region**: Choose closest to your users
6. Click "Create new project"
7. Wait for the project to be ready (usually 1-2 minutes)

### 2. Create Storage Bucket

1. In your Supabase dashboard, go to **Storage** in the left sidebar
2. Click **Create a new bucket**
3. Set the bucket name to: `photos`
4. Make sure **Public bucket** is **enabled** (this allows direct access to images)
5. Click **Create bucket**

### 3. Set Bucket Policies (Optional but Recommended)

For better security, you can set up Row Level Security policies:

1. Go to **Storage** → **Policies**
2. Create policies for the `photos` bucket:
   - **SELECT policy**: Allow public read access
   - **INSERT policy**: Allow authenticated users to upload
   - **DELETE policy**: Allow users to delete their own photos

### 4. Get Your Credentials

1. Go to **Settings** → **API** in your Supabase dashboard
2. Copy the following values:
   - **Project URL** (something like `https://abcdefgh.supabase.co`)
   - **anon public key** (starts with `eyJ...`)
   - **service_role secret key** (starts with `eyJ...`) - ⚠️ Keep this secret!

### 5. Update Your Environment

#### For Local Development (start-dev.sh)

Edit the `start-dev.sh` file and replace these lines with your actual values:

```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
```

#### For Docker Compose

Edit `docker-compose.yml` and update the backend environment variables:

```yaml
environment:
  # ... other variables ...
  SUPABASE_URL: https://your-project-ref.supabase.co
  SUPABASE_ANON_KEY: your-anon-key
  SUPABASE_SERVICE_ROLE_KEY: your-service-role-key
```

#### For Production

Set these environment variables in your production environment:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Testing the Setup

1. Start your development environment:
   ```bash
   ./start-dev.sh
   ```

2. Try uploading a photo through the app
3. Check your Supabase Storage bucket to see if the photo appears
4. The photo should be accessible via a public URL like:
   `https://your-project.supabase.co/storage/v1/object/public/photos/couple-id/photo-id`

## Troubleshooting

### Photos not uploading
- Check that your Supabase credentials are correct
- Verify the `photos` bucket exists and is public
- Check the backend logs for error messages

### Photos not displaying
- Ensure the bucket is set to public
- Check that the storage URL is being saved correctly in the database
- Verify CORS settings in Supabase if accessing from browser

### Permission errors
- Make sure you're using the service role key for uploads (not the anon key)
- Check bucket policies if you've set up RLS

## Migration from Database Storage

The app automatically handles the transition:
- New photos are stored in Supabase
- Old photos (if any) will fall back to generating Supabase URLs
- The database migration adds the `storage_url` column while keeping old columns for safety

## Cost Considerations

Supabase Free Tier includes:
- 1GB storage
- 2GB bandwidth per month
- No credit card required

This should be plenty for development and small-scale usage. For production, check [Supabase pricing](https://supabase.com/pricing) for current rates. 