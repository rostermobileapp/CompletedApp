# Deployment Guide

This guide covers deploying your application with:
- **Database**: Supabase (PostgreSQL)
- **Frontend**: Vercel
- **Backend**: Replit

## Prerequisites

1. Supabase account with a project created
2. Vercel account
3. Replit account (for backend hosting)

## Database Setup (Supabase)

### 1. Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Wait for the project to be provisioned

### 2. Get Database Credentials

1. Go to **Project Settings** → **Database**
2. Under **Connection string**, select **Transaction pooling**
3. Copy the connection string (format: `postgresql://postgres.PROJECT_REF:PASSWORD@aws-1-REGION.pooler.supabase.com:6543/postgres`)
4. Also get your Project URL and Service Role Key from **Project Settings** → **API**

### 3. Configure Replit Backend

Add these secrets in Replit:
- `DATABASE_URL`: Your Supabase connection string
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key

### 4. Push Database Schema

Run in Replit terminal:
```bash
npm run db:push
```

## Frontend Deployment (Vercel)

### 1. Connect GitHub Repository

1. Push your code to a GitHub repository
2. Go to https://vercel.com
3. Click **Add New** → **Project**
4. Import your GitHub repository

### 2. Configure Build Settings

Vercel should auto-detect the settings from `vercel.json`, but verify:
- **Build Command**: `vite build`
- **Output Directory**: `dist/public`
- **Install Command**: `npm install`

### 3. Set Environment Variables

In Vercel project settings → Environment Variables, add:

**Required:**
- `VITE_API_BASE_URL`: Your Replit backend URL (e.g., `https://your-replit-app.repl.co`)

**Optional (if using Stripe on frontend):**
- `VITE_STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key

### 4. Deploy

Click **Deploy** and wait for the build to complete.

## Backend Configuration (Replit)

### Set FRONTEND_URL

After deploying to Vercel, add the Vercel URL as an environment variable in Replit:

- `FRONTEND_URL`: Your Vercel deployment URL (e.g., `https://your-app.vercel.app`)

This enables CORS for your Vercel frontend to communicate with the Replit backend.

## Testing the Deployment

1. **Test Database Connection**: 
   - Check Replit logs for any database errors
   - The application should start without "relation does not exist" errors

2. **Test Frontend**: 
   - Visit your Vercel URL
   - Open browser DevTools console
   - Check for CORS errors or failed API calls

3. **Test API Communication**:
   - Try logging in or making API calls from the frontend
   - Verify requests reach the Replit backend successfully

## Troubleshooting

### CORS Errors
If you see CORS errors in the browser console:
1. Verify `FRONTEND_URL` is set correctly in Replit secrets
2. Ensure the URL matches exactly (no trailing slash)
3. Restart the Replit workflow after adding the secret

### API Calls Failing
If API calls from Vercel frontend fail:
1. Check `VITE_API_BASE_URL` in Vercel environment variables
2. Ensure it points to your Replit app URL
3. Redeploy Vercel after changing environment variables

### Database Connection Issues
If database connection fails:
1. Verify `DATABASE_URL` format matches Supabase's pooler connection string
2. Check username includes project ref: `postgres.PROJECT_REF`
3. Ensure you're using port 6543 for transaction pooling
4. Verify the region in the URL matches your Supabase project

## Environment Variables Reference

### Backend (Replit)
```env
DATABASE_URL=postgresql://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (Vercel)
```env
VITE_API_BASE_URL=https://your-replit-app.repl.co
```

## Production Checklist

- [x] Database schema pushed to Supabase
- [x] All environment variables set in Replit (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, FRONTEND_URL)
- [x] All environment variables set in Vercel (VITE_API_BASE_URL)
- [x] Frontend successfully deployed to Vercel (https://completed-app.vercel.app)
- [x] Backend running on Replit without errors
- [x] CORS configured and working
- [x] API calls from frontend reaching backend
- [ ] Authentication working (requires user testing)
- [x] Database queries executing successfully
