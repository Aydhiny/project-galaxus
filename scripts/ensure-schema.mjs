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
