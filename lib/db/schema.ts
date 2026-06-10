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
} from "drizzle-orm/pg-core";

export const dailyCheckins = pgTable(
  "daily_checkins",
  {
    id: serial("id").primaryKey(),
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
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => [unique("uq_daily_checkins_date").on(t.date)]
);

export const books = pgTable("books", {
  id: serial("id").primaryKey(),
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
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const trainingExercises = pgTable("training_exercises", {
  id: serial("id").primaryKey(),
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
  type: varchar("type", { length: 20 }).notNull(),
  content: text("content").notNull(),
  date: date("date").notNull(),
  mood: integer("mood"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const beats = pgTable("beats", {
  id: serial("id").primaryKey(),
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

export type DailyCheckin = typeof dailyCheckins.$inferSelect;
export type Book = typeof books.$inferSelect;
export type Course = typeof courses.$inferSelect;
export type TrainingPlan = typeof trainingPlans.$inferSelect;
export type TrainingExercise = typeof trainingExercises.$inferSelect;
export type DailyGoal = typeof dailyGoals.$inferSelect;
export type GoalCompletion = typeof goalCompletions.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type Beat = typeof beats.$inferSelect;
