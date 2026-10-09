import {
  pgTable,
  serial,
  varchar,
  boolean,
  integer,
  text,
  date,
  timestamp,
  unique,
  real,
  jsonb,
  index,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { Block } from "@/lib/blocks";
import type { TaskAttachment } from "@/lib/attachments";

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash"), // null for OAuth-only accounts (Google/GitHub sign-in)
  plan: varchar("plan", { length: 20 }).notNull().default("free"), // 'free' | 'pro'
  emailVerified: timestamp("email_verified"),
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  stripeCustomerId: varchar("stripe_customer_id", { length: 255 }).unique(),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  subscriptionStatus: varchar("subscription_status", { length: 30 }), // Stripe's own enum, stored verbatim
  currentPeriodEnd: timestamp("current_period_end"),
  // Bumped on password change/reset, 2FA changes and "sign out everywhere".
  // Every session JWT carries the version it was issued with; a mismatch
  // means the session was revoked (see auth.ts jwt callback).
  sessionVersion: integer("session_version").notNull().default(0),
  // Last accepted TOTP time step — rejects replaying a code inside its window.
  totpLastStep: integer("totp_last_step"),
});

// ─── Verification Tokens (password reset + email verify) ─────────────────────
export const verificationTokens = pgTable("verification_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  purpose: varchar("purpose", { length: 20 }).notNull(), // 'password_reset' | 'email_verify'
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── 2FA Backup Codes ──────────────────────────────────────────────────────────
export const backupCodes = pgTable("backup_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: text("code_hash").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

const userIdCol = () => integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

// ─── Notifications ─────────────────────────────────────────────────────────────
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  type: varchar("type", { length: 30 }).notNull(), // 'achievement' | 'digest' | 'billing_upgraded' | 'billing_past_due' | 'billing_canceled' | 'streak_freeze'
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Dedup ledger only — getAchievements() itself stays pure/derived, this just
// tracks which unlocks we've already surfaced a notification for.
export const notifiedAchievements = pgTable(
  "notified_achievements",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    achievementId: varchar("achievement_id", { length: 50 }).notNull(),
    notifiedAt: timestamp("notified_at").defaultNow(),
  },
  (t) => [unique("uq_notified_achievements_user_achievement").on(t.userId, t.achievementId)]
);

// ─── Streak Freezes ─────────────────────────────────────────────────────────────
// Not a stored balance — "freezes used this month" is a computed count of rows
// created since the start of the current calendar month (see lib/plan.ts /
// lib/actions/checkin.ts). The ledger IS the balance; nothing to reset or drift.
export const streakFreezes = pgTable(
  "streak_freezes",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    habitField: varchar("habit_field", { length: 20 }).notNull(), // one of getStreaks()'s keys: prayers, training, meditation, music, gratitude, writing
    coveredDate: date("covered_date").notNull(), // the day that would otherwise have broken the streak
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [unique("uq_streak_freezes_user_habit_date").on(t.userId, t.habitField, t.coveredDate)]
);

export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    date: date("date").notNull(),
    fajr: boolean("fajr").default(false),
    dhuhr: boolean("dhuhr").default(false),
    asr: boolean("asr").default(false),
    maghrib: boolean("maghrib").default(false),
    isha: boolean("isha").default(false),
    quranPages: integer("quran_pages").default(0),
    training: boolean("training").default(false),
    trainingMinutes: integer("training_minutes").default(0),
    meditation: boolean("meditation").default(false),
    meditationMinutes: integer("meditation_minutes").default(0),
    music: boolean("music").default(false),
    musicMinutes: integer("music_minutes").default(0),
    design: boolean("design").default(false),
    youtube: boolean("youtube").default(false),
    writing: boolean("writing").default(false),
    gratitude: boolean("gratitude").default(false),
    gratitudeText: text("gratitude_text"),            // newline-separated 3 bullets
    notes: text("notes"),
    sleepHours: real("sleep_hours"),                  // e.g. 7.5
    sleepQuality: integer("sleep_quality"),           // 1–5
    bedTime: varchar("bed_time", { length: 5 }),      // "22:30"
    wakeTime: varchar("wake_time", { length: 5 }),    // "06:30"
    // Overview flow fields
    morningMood: integer("morning_mood"),             // 1–10 from morning overview
    eveningMood: integer("evening_mood"),             // 1–10 from evening overview
    dayRating: integer("day_rating"),                 // 1–10 overall day score
    intention: varchar("intention", { length: 100 }), // morning word/phrase
    priorities: text("priorities"),                   // JSON: string[]
    tomorrowNote: text("tomorrow_note"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_daily_checkins_user_date").on(t.userId, t.date)]
);

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  title: varchar("title", { length: 255 }).notNull(),
  author: varchar("author", { length: 255 }),
  status: varchar("status", { length: 20 }).default("reading"),
  pagesTotal: integer("pages_total"),
  pagesRead: integer("pages_read").default(0),
  startedAt: date("started_at"),
  completedAt: date("completed_at"),
  rating: integer("rating"),
  notes: text("notes"),
  coverColor: varchar("cover_color", { length: 7 }).default("#C9A84C"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  title: varchar("title", { length: 255 }).notNull(),
  platform: varchar("platform", { length: 100 }),
  instructor: varchar("instructor", { length: 255 }),
  status: varchar("status", { length: 20 }).default("in_progress"),
  progress: integer("progress").default(0),
  startedAt: date("started_at"),
  completedAt: date("completed_at"),
  month: integer("month"),
  year: integer("year"),
  notes: text("notes"),
  url: varchar("url", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trainingPlans = pgTable("training_plans", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trainingExercises = pgTable("training_exercises", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  planId: integer("plan_id").references(() => trainingPlans.id, {
    onDelete: "cascade",
  }),
  name: varchar("name", { length: 255 }).notNull(),
  sets: integer("sets"),
  reps: varchar("reps", { length: 50 }),
  weight: varchar("weight", { length: 50 }),
  day: varchar("day", { length: 20 }),
  orderIndex: integer("order_index").default(0),
});

export const dailyGoals = pgTable("daily_goals", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  title: varchar("title", { length: 255 }).notNull(),
  isActive: boolean("is_active").default(true),
  orderIndex: integer("order_index").default(0),
  category: varchar("category", { length: 50 }).default("general"),
  emoji: varchar("emoji", { length: 10 }).default("✓"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const goalCompletions = pgTable(
  "goal_completions",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    goalId: integer("goal_id").references(() => dailyGoals.id, {
      onDelete: "cascade",
    }),
    date: date("date").notNull(),
    completed: boolean("completed").default(false),
  },
  (t) => [unique("uq_goal_completions_goal_date").on(t.goalId, t.date)]
);

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  type: varchar("type", { length: 20 }).notNull(),
  content: text("content").notNull(),
  date: date("date").notNull(),
  mood: integer("mood"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const beats = pgTable("beats", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  name: varchar("name", { length: 255 }).notNull(),
  bpm: integer("bpm"),
  key: varchar("key", { length: 10 }),
  mood: varchar("mood", { length: 50 }),        // dark / melodic / trap / afro / drill / chill
  genre: varchar("genre", { length: 50 }),
  status: varchar("status", { length: 20 }).default("idea"), // idea / draft / finished / released / sold
  client: varchar("client", { length: 255 }),
  notes: text("notes"),
  producedAt: date("produced_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const beatSales = pgTable("beat_sales", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  beatId: integer("beat_id").references(() => beats.id, { onDelete: "set null" }),
  date: date("date").notNull(),
  amountCents: integer("amount_cents").notNull(),  // stored as cents; divide by 100 for display
  platform: varchar("platform", { length: 100 }),  // BeatStars / direct / etc.
  client: varchar("client", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Personal Records ─────────────────────────────────────────────────────────
export const personalRecords = pgTable("personal_records", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  exercise: varchar("exercise", { length: 255 }).notNull(),
  value: real("value").notNull(),
  unit: varchar("unit", { length: 50 }).default("kg"),
  notes: text("notes"),
  recordedAt: date("recorded_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Reading Sessions ──────────────────────────────────────────────────────────
export const readingSessions = pgTable("reading_sessions", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  bookId: integer("book_id").references(() => books.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  minutesRead: integer("minutes_read").default(0),
  pagesRead: integer("pages_read").default(0),
  startPage: integer("start_page"),
  endPage: integer("end_page"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Bookmarks ────────────────────────────────────────────────────────────────
export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  bookId: integer("book_id").references(() => books.id, { onDelete: "cascade" }),
  page: integer("page").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Book Content (uploaded files) ────────────────────────────────────────────
export const bookContent = pgTable("book_content", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  bookId: integer("book_id").references(() => books.id, { onDelete: "cascade" }).unique(),
  fileUrl: text("file_url").notNull(),
  fileType: varchar("file_type", { length: 10 }).notNull().default("pdf"),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── Study Sessions ───────────────────────────────────────────────────────────
export const studySessions = pgTable("study_sessions", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  date: date("date").notNull(),
  topic: varchar("topic", { length: 255 }),
  courseId: integer("course_id").references(() => courses.id, { onDelete: "set null" }),
  hours: real("hours").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Add audioUrl to beats (separate table to avoid breaking existing beat actions)
// Using an extension approach: beats_audio
export const beatsAudio = pgTable("beats_audio", {
  id: serial("id").primaryKey(),
  userId: userIdCol(),
  beatId: integer("beat_id").references(() => beats.id, { onDelete: "cascade" }).unique(),
  audioUrl: text("audio_url").notNull(),
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"),
  createdAt: timestamp("created_at").defaultNow(),
});

// ─── User Settings (one row per user) ─────────────────────────────────────────
export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: userIdCol().unique(),
  dashboardFocus: text("dashboard_focus"),
  notifyPrayerReminders: boolean("notify_prayer_reminders").default(true),
  notifyPrayerMinutesBefore: integer("notify_prayer_minutes_before").default(10),
  notifyDailyCheckin: boolean("notify_daily_checkin").default(true),
  notifyDailyCheckinHour: integer("notify_daily_checkin_hour").default(20),
  notifyWeeklyDigest: boolean("notify_weekly_digest").default(true),
  leaderboardOptIn: boolean("leaderboard_opt_in").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Workspace Pages (Notion-style docs) ──────────────────────────────────────
// A page's content is one JSONB array of blocks rather than a row per block.
// The editor always saves the whole document at once (debounced autosave), so
// one row = one write, and reordering blocks is just reordering an array.
export const workspacePages = pgTable(
  "workspace_pages",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    parentId: integer("parent_id").references((): AnyPgColumn => workspacePages.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull().default(""),
    icon: varchar("icon", { length: 16 }),
    blocks: jsonb("blocks").$type<Block[]>().notNull().default([]),
    isFavorite: boolean("is_favorite").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_workspace_pages_user").on(t.userId)]
);

// ─── Monthly goals ─────────────────────────────────────────────────────────────
// A goal you want to reach within one calendar month ("Learn a handstand —
// 2026-10"). Its plan is ordinary tasks linked via tasks.goal_id, optionally
// grouped by tasks.phase ("Week 1 · Foundations" → "Week 4 · Freestanding").
export const monthlyGoals = pgTable(
  "monthly_goals",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"), // the "why" / definition of done
    emoji: varchar("emoji", { length: 16 }),
    month: varchar("month", { length: 7 }).notNull(), // "YYYY-MM"
    area: varchar("area", { length: 20 }), // area of life (lib/areas.ts); plan tasks inherit it
    status: varchar("status", { length: 20 }).notNull().default("active"), // 'active' | 'achieved' | 'abandoned'
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [index("idx_monthly_goals_user_month").on(t.userId, t.month)]
);

// ─── Personal API tokens (MCP / integrations) ─────────────────────────────────
// Only a SHA-256 hash is stored; the raw token is shown to the user once.
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    name: varchar("name", { length: 100 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    prefix: varchar("prefix", { length: 16 }).notNull(), // first chars, so users can tell tokens apart
    lastUsedAt: timestamp("last_used_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_api_tokens_user").on(t.userId)]
);

// ─── Recurring task templates ────────────────────────────────────────────────
// A template materialises one real `tasks` row per applicable day (see
// lib/actions/recurring.ts). Templates hold the rule; tasks hold the history.
export const recurringTasks = pgTable(
  "recurring_tasks",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    title: varchar("title", { length: 500 }).notNull(),
    priority: varchar("priority", { length: 10 }).notNull().default("none"),
    // 7 chars, Monday→Sunday, "1" = repeats that day. "1111111" = every day.
    days: varchar("days", { length: 7 }).notNull().default("1111111"),
    time: varchar("time", { length: 5 }), // "08:00" (local), optional
    area: varchar("area", { length: 20 }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_recurring_tasks_user").on(t.userId)]
);

// ─── Tasks ─────────────────────────────────────────────────────────────────────
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    title: varchar("title", { length: 500 }).notNull(),
    notes: text("notes"),
    status: varchar("status", { length: 20 }).notNull().default("todo"), // 'todo' | 'doing' | 'done'
    priority: varchar("priority", { length: 10 }).notNull().default("none"), // 'none' | 'low' | 'medium' | 'high'
    dueDate: date("due_date"),
    dueTime: varchar("due_time", { length: 5 }), // "08:00" — set for recurring instances
    pageId: integer("page_id").references(() => workspacePages.id, { onDelete: "set null" }),
    recurringId: integer("recurring_id").references(() => recurringTasks.id, { onDelete: "set null" }),
    goalId: integer("goal_id").references(() => monthlyGoals.id, { onDelete: "set null" }),
    phase: varchar("phase", { length: 100 }), // plan stage within a goal, e.g. "Week 1 · Foundations"
    area: varchar("area", { length: 20 }), // area of life: training | faith | reading | youtube | mind | sleep | study
    // Links / images: [{ type: "link" | "image", url, title? }] — small, always
    // loaded with the task, so a JSONB column beats a join table here.
    attachments: jsonb("attachments").$type<TaskAttachment[]>().notNull().default([]),
    orderIndex: integer("order_index").notNull().default(0),
    completedAt: timestamp("completed_at"),
    // Soft delete: removed tasks keep their history (stats, weekly review)
    // and feed the "bring it back?" prompt the next day.
    deletedAt: timestamp("deleted_at"),
    // Set once the user answered the "bring it back?" prompt (or the task was
    // archived automatically, e.g. a missed recurring instance).
    deletionReviewedAt: timestamp("deletion_reviewed_at"),
    // Brought back after removal → completing it is worth double points.
    restoredAt: timestamp("restored_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    index("idx_tasks_user_status").on(t.userId, t.status),
    index("idx_tasks_user_completed").on(t.userId, t.completedAt),
    // One instance per template per day — makes generation idempotent.
    uniqueIndex("uq_tasks_recurring_due").on(t.recurringId, t.dueDate),
    index("idx_tasks_goal").on(t.goalId),
  ]
);

// ─── Outreach engine ───────────────────────────────────────────────────────────
// Finds local businesses (Google Places), audits their web presence, drafts a
// cold message, and releases small batches at random times on workdays. The
// user sends each one personally via WhatsApp click-to-chat — nothing is sent
// automatically (see lib/services/outreach/engine.ts).

/** One row per user: campaign config + encrypted provider keys. */
export const outreachSettings = pgTable("outreach_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  active: boolean("active").notNull().default(false),
  senderName: varchar("sender_name", { length: 100 }),
  // What you sell, in your words — fed to the message writer.
  offer: text("offer"),
  dailyVolume: integer("daily_volume").notNull().default(15),
  batches: integer("batches").notNull().default(3),
  windowStart: integer("window_start").notNull().default(8), // local hour, inclusive
  windowEnd: integer("window_end").notNull().default(18), // local hour, exclusive
  timezone: varchar("timezone", { length: 50 }).notNull().default("Europe/Sarajevo"),
  // AES-256-GCM ciphertexts (lib/crypto-box.ts) — never returned to the client.
  googleKeyEnc: text("google_key_enc"),
  anthropicKeyEnc: text("anthropic_key_enc"),
  lastReview: text("last_review"),
  lastReviewAt: timestamp("last_review_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/** A Places text query to mine, e.g. "stomatološka ordinacija" in "Sarajevo". */
export const leadSearches = pgTable(
  "lead_searches",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    query: varchar("query", { length: 200 }).notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    category: varchar("category", { length: 60 }), // label, e.g. "Dentist"
    active: boolean("active").notNull().default(true),
    // Places paginates (max 3 pages × 20). null token + pages > 0 = exhausted.
    nextPageToken: text("next_page_token"),
    pagesFetched: integer("pages_fetched").notNull().default(0),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_lead_searches_user").on(t.userId)]
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    searchId: integer("search_id").references(() => leadSearches.id, { onDelete: "set null" }),
    placeId: varchar("place_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 60 }),
    phone: varchar("phone", { length: 32 }), // E.164, e.g. +38761123456
    channel: varchar("channel", { length: 12 }).notNull().default("call"), // 'whatsapp' (mobile) | 'call' (landline)
    address: text("address"),
    city: varchar("city", { length: 100 }),
    website: text("website"),
    mapsUrl: text("maps_url"),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    gaps: jsonb("gaps").$type<string[]>().notNull().default([]),
    score: integer("score").notNull().default(0),
    revenueKm: integer("revenue_km"), // annual revenue (CompanyWall), entered by hand
    // new → audited → ready → queued → sent → replied → meeting → client
    // side exits: skipped | not_interested | do_not_contact
    status: varchar("status", { length: 20 }).notNull().default("new"),
    skipReason: varchar("skip_reason", { length: 40 }),
    message: text("message"),
    messageVariant: varchar("message_variant", { length: 40 }),
    queuedFor: date("queued_for"),
    batch: integer("batch"),
    sentAt: timestamp("sent_at"),
    repliedAt: timestamp("replied_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_leads_user_place").on(t.userId, t.placeId),
    index("idx_leads_user_status").on(t.userId, t.status),
  ]
);

/** The day's randomly drawn batch times, so every tick agrees on them. */
export type OutreachSlot = { time: string; batch: number; releasedAt?: string; count?: number };
export const outreachDays = pgTable(
  "outreach_days",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    day: date("day").notNull(),
    slots: jsonb("slots").$type<OutreachSlot[]>().notNull().default([]),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [uniqueIndex("uq_outreach_days_user_day").on(t.userId, t.day)]
);

/** Web Push subscriptions (one per device/browser). */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: userIdCol(),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("idx_push_subscriptions_user").on(t.userId)]
);

/** App-wide generated secrets (VAPID keys). Values are encrypted. */
export const appSecrets = pgTable("app_secrets", {
  name: varchar("name", { length: 60 }).primaryKey(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type User = typeof users.$inferSelect;
export type DailyCheckin = typeof dailyCheckins.$inferSelect;
export type Book = typeof books.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type TrainingExercise = typeof trainingExercises.$inferSelect;
export type DailyGoal = typeof dailyGoals.$inferSelect;
export type GoalCompletion = typeof goalCompletions.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type Beat = typeof beats.$inferSelect;
export type BeatSale = typeof beatSales.$inferSelect;
export type PersonalRecord = typeof personalRecords.$inferSelect;
export type ReadingSession = typeof readingSessions.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type BookContent = typeof bookContent.$inferSelect;
export type StudySession = typeof studySessions.$inferSelect;
export type BeatAudio      = typeof beatsAudio.$inferSelect;
export type UserSettings   = typeof userSettings.$inferSelect;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type BackupCode = typeof backupCodes.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type NotifiedAchievement = typeof notifiedAchievements.$inferSelect;
export type StreakFreeze = typeof streakFreezes.$inferSelect;
export type WorkspacePage = typeof workspacePages.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type RecurringTask = typeof recurringTasks.$inferSelect;
export type MonthlyGoal = typeof monthlyGoals.$inferSelect;
export type ApiToken = typeof apiTokens.$inferSelect;
export type OutreachSettings = typeof outreachSettings.$inferSelect;
export type LeadSearch = typeof leadSearches.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type OutreachDay = typeof outreachDays.$inferSelect;
