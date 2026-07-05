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
} from "drizzle-orm/pg-core";

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
  updatedAt: timestamp("updated_at").defaultNow(),
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
