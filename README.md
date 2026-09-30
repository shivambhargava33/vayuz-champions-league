# VAYUZ Cricket

Mobile-first cricket scoring: teams, players, ball-by-ball scoring (3 balls/over), live scoreboard.
Anyone with the link can watch; scoring and editing need the scorer PIN.

## Deploy (about 10 minutes)

1. **Supabase**: create a project at supabase.com. Open SQL Editor, paste `supabase/schema.sql`, Run.
   Then Project Settings -> API: copy the Project URL and the `service_role` key.
2. **Vercel**: push this folder to a Git repo, import it at vercel.com/new, and add env vars:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only, never exposed to the browser)
   - `ADMIN_PIN` and `UMPIRE_PIN` (share the umpire PIN with scorers)
3. Deploy. Share the `*.vercel.app` link on the team chat.

## Run locally

    cp .env.example .env.local   # fill in values
    npm install && npm run dev
