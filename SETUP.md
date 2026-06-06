# Galaxus — Setup Guide

## Local Development

1. **Clone / open the project**

2. **Create `.env.local`** (already exists, just add the DB URL):
   ```
   DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
   ADMIN_USERNAME=ajdin
   ADMIN_PASSWORD=galaxus2026
   AUTH_SECRET=galaxus-super-secret-key-change-this-in-production
   ```

3. **Set up NeonDB**:
   - Go to https://neon.tech and create a free project
   - Copy the connection string into `DATABASE_URL` in `.env.local`
   - Run: `npm run db:push`

4. **Start the dev server**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 → login with `ajdin` / `galaxus2026`

## Deploy to Vercel (free)

1. Push code to GitHub: `git remote add origin <your-repo> && git push -u origin master`
2. Import project at vercel.com/new
3. Add environment variables in Vercel dashboard (same as `.env.local`)
4. Deploy — it auto-builds on every push

## Database Commands

```bash
npm run db:push      # Push schema changes directly to NeonDB (development)
npm run db:generate  # Generate migration files
npm run db:migrate   # Run migrations
npm run db:studio    # Open Drizzle Studio (visual DB browser)
```

## App Structure

```
app/
  (dashboard)/
    dashboard/     → Main overview (/dashboard)
    daily/         → Daily check-in with all habit toggles
    reading/       → Book library + monthly reading goal
    study/         → Courses tracker
    training/      → Training plans + 30-day history
    spiritual/     → Islamic prayers + Quran tracking
    creative/      → Music / Design / YouTube
    journal/       → Gratitude + writing journal
    goals/         → Daily goals checklist
  login/           → Login page
lib/
  db/
    schema.ts      → Drizzle ORM schema (all 8 tables)
    index.ts       → NeonDB connection
  actions/         → Server Actions (mutations + queries)
components/
  sidebar.tsx      → Navigation sidebar
  streak-ring.tsx  → SVG streak visualizer
  widgets/         → Dashboard widgets
```

## Credentials

- Username: `ajdin`
- Password: `galaxus2026`
- (Change in `.env.local` anytime)
