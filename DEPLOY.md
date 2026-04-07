# Deployment Guide - Render + Supabase (Free Tier)

## Step 1: Set Up Supabase (Free PostgreSQL)

1. Go to https://supabase.com and sign up (free)
2. Create a new project (choose a region close to you)
3. Set a **database password** and save it
4. Go to **Project Settings → Database**
5. Note the connection details:
   - Host: `db.xxxxxxxxxxxx.supabase.co`
   - Port: `5432`
   - Database: `postgres`
   - Password: (the password you set)
6. Format the DATABASE_URL for Nakama:
   ```
   postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres
   ```

## Step 2: Deploy Backend on Render

1. Go to https://render.com and sign up (free)
2. Click **New → Web Service**
3. Connect your GitHub repo: `sekar2002/tic-tac-game`
4. Configure:
   - **Name**: `tictactoe-backend`
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile.render`
   - **Plan**: Free
5. Add environment variable:
   - Key: `DATABASE_URL`
   - Value: `postgres:YOUR_PASSWORD@db.xxxxxxxxxxxx.supabase.co:5432/postgres`
6. Click **Create Web Service**
7. Wait for build (~5-10 min)
8. Note your backend URL: `https://tictactoe-backend-xxxx.onrender.com`

## Step 3: Deploy Frontend on Render

1. Click **New → Static Site**
2. Connect the same repo: `sekar2002/tic-tac-game`
3. Configure:
   - **Name**: `tictactoe-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist/tictactoe-frontend`
4. Click **Create Static Site**

## Step 4: Connect Frontend to Backend

Update `frontend/src/index.html` — replace `%%NAKAMA_BACKEND_URL%%` with your actual backend URL:

```html
<script>
  window.__NAKAMA_URL__ = 'https://tictactoe-backend-xxxx.onrender.com';
</script>
```

Commit and push — Render auto-redeploys.

## Notes

- **Cold starts**: Free tier sleeps after 15 min inactivity. First request takes ~30-60s.
- **Supabase free tier**: 500MB storage, 2 projects max.
- **Render free tier**: 750 hours/month for web services.
