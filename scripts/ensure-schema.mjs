// Applies additive schema changes during Vercel *production* builds — the
// only place DATABASE_URL exists (it lives in Vercel's env, not in the repo
// or locally). Runs before `next build`; if it fails, the build fails, so a
// deploy can never go live with code that expects tables that don't exist.
//
// RULES for this file:
//   • Additive + idempotent only (IF NOT EXISTS). It runs on every deploy.
//   • Never DROP / rename / change types here — do destructive changes by
//     hand with `npm run db:push` and a backup.
//   • Constraint names mirror drizzle-kit's naming so a later `db:push`
//     sees no diff.

import { neon } from "@neondatabase/serverless";

const STATEMENTS = [
  // ── 2026-10 · Pages + Tasks ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "workspace_pages" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "parent_id" integer,
    "title" varchar(255) DEFAULT '' NOT NULL,
    "icon" varchar(16),
    "blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "is_favorite" boolean DEFAULT false NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "workspace_pages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "workspace_pages_parent_id_workspace_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "workspace_pages"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_workspace_pages_user" ON "workspace_pages" ("user_id")`,

  `CREATE TABLE IF NOT EXISTS "tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "title" varchar(500) NOT NULL,
    "notes" text,
    "status" varchar(20) DEFAULT 'todo' NOT NULL,
    "priority" varchar(10) DEFAULT 'none' NOT NULL,
    "due_date" date,
    "page_id" integer,
    "order_index" integer DEFAULT 0 NOT NULL,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "tasks_page_id_workspace_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "workspace_pages"("id") ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_tasks_user_status" ON "tasks" ("user_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "idx_tasks_user_completed" ON "tasks" ("user_id", "completed_at")`,

  // ── 2026-10 · Session revocation + TOTP replay protection ────────────────
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_last_step" integer`,

  // ── 2026-10 · Recurring tasks, soft delete, points ───────────────────────
  `CREATE TABLE IF NOT EXISTS "recurring_tasks" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "title" varchar(500) NOT NULL,
    "priority" varchar(10) DEFAULT 'none' NOT NULL,
    "days" varchar(7) DEFAULT '1111111' NOT NULL,
    "time" varchar(5),
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "recurring_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_recurring_tasks_user" ON "recurring_tasks" ("user_id")`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "due_time" varchar(5)`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurring_id" integer`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deletion_reviewed_at" timestamp`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "restored_at" timestamp`,
  // ADD CONSTRAINT has no IF NOT EXISTS in Postgres — guard via the catalog.
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_recurring_id_recurring_tasks_id_fk') THEN
      ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recurring_id_recurring_tasks_id_fk"
        FOREIGN KEY ("recurring_id") REFERENCES "recurring_tasks"("id") ON DELETE set null;
    END IF;
  END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_tasks_recurring_due" ON "tasks" ("recurring_id", "due_date")`,

  // ── 2026-10 · Monthly goals + personal API tokens (MCP) ─────────────────
  `CREATE TABLE IF NOT EXISTS "monthly_goals" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "title" varchar(200) NOT NULL,
    "description" text,
    "emoji" varchar(16),
    "month" varchar(7) NOT NULL,
    "status" varchar(20) DEFAULT 'active' NOT NULL,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "monthly_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_monthly_goals_user_month" ON "monthly_goals" ("user_id", "month")`,
  `CREATE TABLE IF NOT EXISTS "api_tokens" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" varchar(100) NOT NULL,
    "token_hash" varchar(64) NOT NULL,
    "prefix" varchar(16) NOT NULL,
    "last_used_at" timestamp,
    "revoked_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash"),
    CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_api_tokens_user" ON "api_tokens" ("user_id")`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "goal_id" integer`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "phase" varchar(100)`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_goal_id_monthly_goals_id_fk') THEN
      ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goal_id_monthly_goals_id_fk"
        FOREIGN KEY ("goal_id") REFERENCES "monthly_goals"("id") ON DELETE set null;
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS "idx_tasks_goal" ON "tasks" ("goal_id")`,

  // ── 2026-10 · Areas of life + task attachments ───────────────────────────
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "area" varchar(20)`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  `ALTER TABLE "recurring_tasks" ADD COLUMN IF NOT EXISTS "area" varchar(20)`,
  `ALTER TABLE "monthly_goals" ADD COLUMN IF NOT EXISTS "area" varchar(20)`,

  // ── 2026-10 · Outreach engine ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "outreach_settings" (
    "user_id" integer PRIMARY KEY NOT NULL,
    "active" boolean DEFAULT false NOT NULL,
    "sender_name" varchar(100),
    "offer" text,
    "daily_volume" integer DEFAULT 15 NOT NULL,
    "batches" integer DEFAULT 3 NOT NULL,
    "window_start" integer DEFAULT 8 NOT NULL,
    "window_end" integer DEFAULT 18 NOT NULL,
    "timezone" varchar(50) DEFAULT 'Europe/Sarajevo' NOT NULL,
    "google_key_enc" text,
    "anthropic_key_enc" text,
    "last_review" text,
    "last_review_at" timestamp,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "outreach_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS "lead_searches" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "query" varchar(200) NOT NULL,
    "city" varchar(100) NOT NULL,
    "category" varchar(60),
    "active" boolean DEFAULT true NOT NULL,
    "next_page_token" text,
    "pages_fetched" integer DEFAULT 0 NOT NULL,
    "last_run_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "lead_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_lead_searches_user" ON "lead_searches" ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "leads" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "search_id" integer,
    "place_id" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "category" varchar(60),
    "phone" varchar(32),
    "channel" varchar(12) DEFAULT 'call' NOT NULL,
    "address" text,
    "city" varchar(100),
    "website" text,
    "maps_url" text,
    "rating" real,
    "review_count" integer,
    "gaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "score" integer DEFAULT 0 NOT NULL,
    "revenue_km" integer,
    "status" varchar(20) DEFAULT 'new' NOT NULL,
    "skip_reason" varchar(40),
    "message" text,
    "message_variant" varchar(40),
    "queued_for" date,
    "batch" integer,
    "sent_at" timestamp,
    "replied_at" timestamp,
    "notes" text,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "leads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "leads_search_id_lead_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "lead_searches"("id") ON DELETE set null
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_leads_user_place" ON "leads" ("user_id", "place_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_leads_user_status" ON "leads" ("user_id", "status")`,
  `CREATE TABLE IF NOT EXISTS "outreach_days" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "day" date NOT NULL,
    "slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "outreach_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_outreach_days_user_day" ON "outreach_days" ("user_id", "day")`,
  `CREATE TABLE IF NOT EXISTS "push_subscriptions" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "endpoint" text NOT NULL,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "user_agent" varchar(255),
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint"),
    CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_push_subscriptions_user" ON "push_subscriptions" ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "app_secrets" (
    "name" varchar(60) PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "created_at" timestamp DEFAULT now()
  )`,

  // ── 2026-10 · Shared secrets + YouTube studio ───────────────────────────
  `CREATE TABLE IF NOT EXISTS "user_secrets" (
    "user_id" integer NOT NULL,
    "name" varchar(40) NOT NULL,
    "value" text NOT NULL,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "user_secrets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_user_secrets_user_name" ON "user_secrets" ("user_id", "name")`,
  `CREATE TABLE IF NOT EXISTS "youtube_channels" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "channel_id" varchar(40) NOT NULL,
    "title" varchar(255) NOT NULL,
    "handle" varchar(100),
    "thumbnail_url" text,
    "description" text,
    "subscribers" integer,
    "total_views" integer,
    "video_count" integer,
    "report" text,
    "report_at" timestamp,
    "last_synced_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "youtube_channels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_youtube_channels_user_channel" ON "youtube_channels" ("user_id", "channel_id")`,
  `CREATE TABLE IF NOT EXISTS "youtube_videos" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "channel_row_id" integer NOT NULL,
    "video_id" varchar(20) NOT NULL,
    "title" varchar(255) NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "published_at" timestamp NOT NULL,
    "duration_sec" integer DEFAULT 0 NOT NULL,
    "is_short" boolean DEFAULT false NOT NULL,
    "views" integer DEFAULT 0 NOT NULL,
    "likes" integer DEFAULT 0 NOT NULL,
    "comments" integer DEFAULT 0 NOT NULL,
    "thumbnail_url" text,
    "has_captions" boolean,
    "swipe_viewed_pct" integer,
    "avg_viewed_pct" integer,
    "script" text,
    "suggestions" text,
    "suggestions_at" timestamp,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "youtube_videos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "youtube_videos_channel_row_id_youtube_channels_id_fk" FOREIGN KEY ("channel_row_id") REFERENCES "youtube_channels"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_youtube_videos_user_video" ON "youtube_videos" ("user_id", "video_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_youtube_videos_channel" ON "youtube_videos" ("channel_row_id")`,
  `CREATE TABLE IF NOT EXISTS "youtube_ideas" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "channel_row_id" integer,
    "title" varchar(255) NOT NULL,
    "format" varchar(10) DEFAULT 'short' NOT NULL,
    "stage" varchar(12) DEFAULT 'idea' NOT NULL,
    "hook" text,
    "script" text,
    "notes" text,
    "video_id" varchar(20),
    "due_date" date,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "youtube_ideas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "youtube_ideas_channel_row_id_youtube_channels_id_fk" FOREIGN KEY ("channel_row_id") REFERENCES "youtube_channels"("id") ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_youtube_ideas_user" ON "youtube_ideas" ("user_id")`,

  // ── 2026-10 · Free lead sources + Places free-tier guard ────────────────
  `ALTER TABLE "lead_searches" ADD COLUMN IF NOT EXISTS "source" varchar(10) DEFAULT 'google' NOT NULL`,
  `ALTER TABLE "outreach_settings" ADD COLUMN IF NOT EXISTS "places_month" varchar(7)`,
  `ALTER TABLE "outreach_settings" ADD COLUMN IF NOT EXISTS "scout_cities" text NOT NULL DEFAULT 'Sarajevo, Mostar, Tuzla, Zenica'`,
  `ALTER TABLE "outreach_settings" ADD COLUMN IF NOT EXISTS "places_calls" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "outreach_settings" ADD COLUMN IF NOT EXISTS "places_monthly_cap" integer DEFAULT 900 NOT NULL`,

  // ── 2026-10 · Voice commands (Claude Code runner) ───────────────────────
  `ALTER TABLE "api_tokens" ADD COLUMN IF NOT EXISTS "scope" varchar(20) DEFAULT 'full' NOT NULL`,
  `CREATE TABLE IF NOT EXISTS "voice_commands" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "transcript" text NOT NULL,
    "local_date" varchar(10) NOT NULL,
    "local_time" varchar(5) NOT NULL,
    "timezone" varchar(50) NOT NULL,
    "status" varchar(10) DEFAULT 'queued' NOT NULL,
    "actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "summary" text,
    "error" text,
    "attempts" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp,
    "finished_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "voice_commands_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_voice_commands_user_status" ON "voice_commands" ("user_id", "status")`,

  // ── 2026-10 · Claude jobs, content calendar, comments, game dev ────────
  `ALTER TABLE "voice_commands" ADD COLUMN IF NOT EXISTS "kind" varchar(20) DEFAULT 'voice' NOT NULL`,
  `ALTER TABLE "voice_commands" ADD COLUMN IF NOT EXISTS "payload" jsonb`,
  `ALTER TABLE "voice_commands" ADD COLUMN IF NOT EXISTS "result" text`,
  `ALTER TABLE "youtube_ideas" ADD COLUMN IF NOT EXISTS "hooks" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  `ALTER TABLE "youtube_ideas" ADD COLUMN IF NOT EXISTS "source" varchar(20)`,
  `ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "youtube_idea_id" integer`,
  `DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tasks_youtube_idea_id_youtube_ideas_id_fk') THEN
      ALTER TABLE "tasks" ADD CONSTRAINT "tasks_youtube_idea_id_youtube_ideas_id_fk"
        FOREIGN KEY ("youtube_idea_id") REFERENCES "youtube_ideas"("id") ON DELETE set null;
    END IF;
  END $$`,
  `CREATE INDEX IF NOT EXISTS "idx_tasks_youtube_idea" ON "tasks" ("youtube_idea_id")`,
  `CREATE TABLE IF NOT EXISTS "youtube_comments" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "channel_row_id" integer NOT NULL,
    "video_id" varchar(20) NOT NULL,
    "comment_id" varchar(80) NOT NULL,
    "author" varchar(120) NOT NULL,
    "text" text NOT NULL,
    "published_at" timestamp NOT NULL,
    "like_count" integer DEFAULT 0 NOT NULL,
    "status" varchar(12) DEFAULT 'new' NOT NULL,
    "reply" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "youtube_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "youtube_comments_channel_row_id_youtube_channels_id_fk" FOREIGN KEY ("channel_row_id") REFERENCES "youtube_channels"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_youtube_comments_user_comment" ON "youtube_comments" ("user_id", "comment_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_youtube_comments_user_status" ON "youtube_comments" ("user_id", "status")`,
  `CREATE TABLE IF NOT EXISTS "game_settings" (
    "user_id" integer PRIMARY KEY NOT NULL,
    "repo" varchar(140),
    "last_devlog_sha" varchar(64),
    "last_devlog_at" timestamp,
    "playtest_themes" jsonb,
    "playtest_themes_at" timestamp,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "game_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS "playtest_feedback" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "tester" varchar(80),
    "build" varchar(40),
    "rating" integer,
    "text" text NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "playtest_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_playtest_feedback_user" ON "playtest_feedback" ("user_id")`,

  `CREATE TABLE IF NOT EXISTS "game_commits" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "repo" varchar(140) NOT NULL,
    "sha" varchar(64) NOT NULL,
    "message" text NOT NULL,
    "committed_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "game_commits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_game_commits_user_sha" ON "game_commits" ("user_id", "sha")`,
  `CREATE INDEX IF NOT EXISTS "idx_game_commits_user_date" ON "game_commits" ("user_id", "committed_at")`,

  // ── 2026-10 · Reddit for the game ───────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS "reddit_settings" (
    "user_id" integer PRIMARY KEY NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "daily_cap" integer DEFAULT 1 NOT NULL,
    "game_name" varchar(120) DEFAULT 'Hunter Mouse 2' NOT NULL,
    "tagline" text,
    "about" text,
    "wishlist_url" text,
    "keywords" text,
    "reddit_username" varchar(30),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "reddit_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS "reddit_communities" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" varchar(30) NOT NULL,
    "title" varchar(200),
    "description" text,
    "subscribers" integer,
    "rules" jsonb,
    "promo_policy" varchar(12) DEFAULT 'unknown' NOT NULL,
    "promo_note" text,
    "hot" jsonb,
    "status" varchar(10) DEFAULT 'active' NOT NULL,
    "source" varchar(10) DEFAULT 'seed' NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "last_posted_at" timestamp,
    "skip_until" timestamp,
    "fetched_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "reddit_communities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_reddit_communities_user_name" ON "reddit_communities" ("user_id", "name")`,
  `CREATE TABLE IF NOT EXISTS "reddit_posts" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "community_id" integer,
    "subreddit" varchar(30) NOT NULL,
    "day" date NOT NULL,
    "title" varchar(300),
    "body" text,
    "first_comment" text,
    "media_hint" text,
    "flair_hint" varchar(100),
    "angle" varchar(120),
    "warnings" jsonb,
    "status" varchar(10) DEFAULT 'queued' NOT NULL,
    "note" text,
    "post_url" text,
    "posted_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "reddit_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "reddit_posts_community_id_reddit_communities_id_fk" FOREIGN KEY ("community_id") REFERENCES "reddit_communities"("id") ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_reddit_posts_user_status" ON "reddit_posts" ("user_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "idx_reddit_posts_user_day" ON "reddit_posts" ("user_id", "day")`,

  // ── 2026-10 · Daily brief ───────────────────────────────────────────────
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_daily_brief" boolean DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "digests" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "day" date NOT NULL,
    "items" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "briefing" jsonb,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_digests_user_day" ON "digests" ("user_id", "day")`,

  // ── 2026-10 · Gig radar, lead automations, money ────────────────────────
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "tags" jsonb DEFAULT '[]'::jsonb NOT NULL`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "demo_slug" varchar(24)`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "follow_up_count" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "site_checked_at" timestamp`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "site_down_since" timestamp`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "client_site_url" text`,
  `ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "retainer_km" integer`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_leads_demo_slug" ON "leads" ("demo_slug")`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "notify_gigs" boolean DEFAULT true`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "income_goal_km" integer`,
  `ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "usd_to_km" real DEFAULT 1.8`,
  `CREATE TABLE IF NOT EXISTS "task_runs" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "task" varchar(40) NOT NULL,
    "last_run_at" timestamp NOT NULL,
    "last_result" text,
    CONSTRAINT "task_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_task_runs_user_task" ON "task_runs" ("user_id", "task")`,
  `CREATE TABLE IF NOT EXISTS "gig_profiles" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "name" varchar(80) NOT NULL,
    "keywords" text NOT NULL,
    "exclude" text,
    "subreddits" text,
    "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "pitch" text,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "gig_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_gig_profiles_user" ON "gig_profiles" ("user_id")`,
  `CREATE TABLE IF NOT EXISTS "gigs" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "profile_id" integer,
    "source" varchar(20) NOT NULL,
    "external_id" varchar(200) NOT NULL,
    "title" varchar(300) NOT NULL,
    "url" text NOT NULL,
    "body" text,
    "author" varchar(120),
    "budget" varchar(60),
    "posted_at" timestamp,
    "score" integer,
    "scored_by" varchar(10),
    "reason" text,
    "draft" text,
    "status" varchar(12) DEFAULT 'new' NOT NULL,
    "notified_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "gigs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "gigs_profile_id_gig_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "gig_profiles"("id") ON DELETE cascade
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_gigs_user_external" ON "gigs" ("user_id", "external_id")`,
  `CREATE INDEX IF NOT EXISTS "idx_gigs_user_status" ON "gigs" ("user_id", "status")`,
  `CREATE TABLE IF NOT EXISTS "site_checks" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "lead_id" integer NOT NULL,
    "checked_at" timestamp DEFAULT now() NOT NULL,
    "ok" boolean NOT NULL,
    "ms" integer,
    "http_status" integer,
    CONSTRAINT "site_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "site_checks_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE cascade
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_site_checks_lead_time" ON "site_checks" ("lead_id", "checked_at")`,
  `CREATE TABLE IF NOT EXISTS "income" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "source" varchar(20) NOT NULL,
    "external_id" varchar(120),
    "amount_km_cents" integer NOT NULL,
    "original_amount_cents" integer,
    "original_currency" varchar(3),
    "description" varchar(300),
    "lead_id" integer,
    "received_at" timestamp DEFAULT now() NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "income_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "income_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_income_user_time" ON "income" ("user_id", "received_at")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "uq_income_user_external" ON "income" ("user_id", "external_id")`,

  // ── 2026-10 · Gig autopilot ─────────────────────────────────────────────
  `ALTER TABLE "gigs" ADD COLUMN IF NOT EXISTS "subject" varchar(300)`,
  `ALTER TABLE "gigs" ADD COLUMN IF NOT EXISTS "contact_email" varchar(200)`,
  `ALTER TABLE "gigs" ADD COLUMN IF NOT EXISTS "image" text`,
  `CREATE TABLE IF NOT EXISTS "autopilot_settings" (
    "user_id" integer PRIMARY KEY NOT NULL,
    "mode" varchar(10) DEFAULT 'shadow' NOT NULL,
    "daily_cap" integer DEFAULT 10 NOT NULL,
    "min_score" integer DEFAULT 70 NOT NULL,
    "website_min_km" integer DEFAULT 1500 NOT NULL,
    "portfolio_url" text DEFAULT 'https://plansio.agency',
    "booking_url" text,
    "sender_name" varchar(100),
    "follow_ups" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "autopilot_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS "gig_emails" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "gig_id" integer,
    "to_email" varchar(200) NOT NULL,
    "subject" varchar(300) NOT NULL,
    "body" text NOT NULL,
    "status" varchar(10) NOT NULL,
    "message_id" varchar(300),
    "sent_at" timestamp,
    "follow_up_at" timestamp,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "last_reply_at" timestamp,
    "last_reply_text" text,
    "last_reply_message_id" varchar(300),
    "category" varchar(30),
    "suggested_reply" text,
    "needs_you" boolean DEFAULT false NOT NULL,
    "auto_replied" integer DEFAULT 0 NOT NULL,
    "error" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "gig_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade,
    CONSTRAINT "gig_emails_gig_id_gigs_id_fk" FOREIGN KEY ("gig_id") REFERENCES "gigs"("id") ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS "idx_gig_emails_user_status" ON "gig_emails" ("user_id", "status")`,
  `CREATE INDEX IF NOT EXISTS "idx_gig_emails_to" ON "gig_emails" ("user_id", "to_email")`,

  // Housekeeping: expired reset/verify tokens are useless — clear them.
  `DELETE FROM "verification_tokens" WHERE "expires_at" < now()`,
];

async function main() {
  if (process.env.VERCEL_ENV !== "production" && process.env.ENSURE_SCHEMA !== "1") {
    console.log(`[ensure-schema] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
    return;
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("[ensure-schema] DATABASE_URL is not set in this Vercel environment.");

  const sql = neon(url);
  for (const statement of STATEMENTS) {
    const label = statement.trim().split("\n")[0].slice(0, 90);
    await sql.query(statement);
    console.log(`[ensure-schema] ok  ${label}`);
  }
  console.log(`[ensure-schema] done — ${STATEMENTS.length} statements applied`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
