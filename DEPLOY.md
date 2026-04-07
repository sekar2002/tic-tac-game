# Deployment Guide - Render + Supabase (Free Tier)

## Architecture

```
Frontend (Angular)  →  Backend (Nakama + Lua)  →  Database (PostgreSQL)
Render Static Site      Render Web Service          Supabase Free Tier
```

## Step 1: Database (Supabase)

1. Sign up at https://supabase.com (free with GitHub)
2. Create new project → set database password → save it
3. Click **Connect** (top right) → copy the **pooler host**
4. Build `DATABASE_URL` (Nakama format):
   ```
   postgres.PROJECT_REF:YOUR_PASSWORD@aws-X-region.pooler.supabase.com:5432/postgres
   ```
   > URL-encode special characters in password (e.g., `@` → `%40`)

## Step 2: Backend (Render Web Service)

1. Sign up at https://render.com (free with GitHub)
2. **New +** → **Web Service** → connect `sekar2002/tic-tac-game`
3. Branch: `deploy/render-supabase`
4. Settings:
   - **Runtime**: Docker
   - **Dockerfile Path**: `./Dockerfile.render`
   - **Plan**: Free
5. Environment variable:
   - `DATABASE_URL` = your Supabase connection string from Step 1
6. Deploy → wait ~5 min → note backend URL

## Step 3: Frontend (Render Static Site)

1. **New +** → **Static Site** → connect same repo
2. Branch: `deploy/render-supabase`
3. Settings:
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist/tictactoe-frontend`
4. Deploy → wait ~3 min

## Step 4: Connect Frontend to Backend

In `frontend/src/index.html`, set your backend URL:
```html
<script>
  window.__NAKAMA_URL__ = 'https://YOUR-BACKEND.onrender.com';
</script>
```
Commit and push — Render auto-redeploys both services.

## Key Files

| File | Purpose |
|---|---|
| `Dockerfile.render` | Nakama server + Lua module |
| `entrypoint.sh` | DB migration + server startup |
| `lua-modules/main.lua` | All 12 RPC functions (game logic) |
| `render.yaml` | Render Blueprint (optional one-click deploy) |
| `frontend/src/index.html` | Backend URL config |
| `frontend/src/app/services/nakama.service.ts` | API + WebSocket client |

## RPC Functions

| RPC | Description |
|---|---|
| `create_game` | Create new game room |
| `join_game` | Join existing room |
| `make_move` | Server-validated move |
| `get_game_state` | Get current game state |
| `check_timeout` | Check timed mode timeout |
| `list_games` | List available rooms |
| `cleanup_games` | Remove stale games |
| `find_match` | Auto-matchmaking |
| `check_match_status` | Poll matchmaking result |
| `get_leaderboard` | Player rankings |
| `store_username` | Save username |
| `update_username` | Update username |

## Troubleshooting

| Issue | Fix |
|---|---|
| Go plugin version mismatch | Use Lua module instead (already done) |
| IPv6 connection refused | Use Supabase **pooler** host, not direct host |
| `@` in DB password | URL-encode as `%40` |
| RPC function not found | Ensure `lua-modules/main.lua` has all RPCs registered |
| CORS errors | Nakama 3.22 allows all origins by default |
| Cold start delay | Free tier sleeps after 15 min — first request takes ~30-60s |

## Free Tier Limits

- **Render**: 750 hrs/month for web services, unlimited static sites
- **Supabase**: 500MB storage, 2 projects max
- **Cold starts**: Backend sleeps after 15 min inactivity
