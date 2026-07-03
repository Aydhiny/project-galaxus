CREATE TABLE "beat_sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"beat_id" integer,
	"date" date NOT NULL,
	"amount_cents" integer NOT NULL,
	"platform" varchar(100),
	"client" varchar(255),
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "beats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"bpm" integer,
	"key" varchar(10),
	"mood" varchar(50),
	"genre" varchar(50),
	"status" varchar(20) DEFAULT 'idea',
	"client" varchar(255),
	"notes" text,
	"produced_at" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "beats_audio" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"beat_id" integer,
	"audio_url" text NOT NULL,
	"file_name" varchar(255),
	"file_size" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "beats_audio_beat_id_unique" UNIQUE("beat_id")
);
--> statement-breakpoint
CREATE TABLE "book_content" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"book_id" integer,
	"file_url" text NOT NULL,
	"file_type" varchar(10) DEFAULT 'pdf' NOT NULL,
	"file_name" varchar(255),
	"file_size" integer,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "book_content_book_id_unique" UNIQUE("book_id")
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"book_id" integer,
	"page" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "personal_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"exercise" varchar(255) NOT NULL,
	"value" real NOT NULL,
	"unit" varchar(50) DEFAULT 'kg',
	"notes" text,
	"recorded_at" date NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reading_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"book_id" integer,
	"date" date NOT NULL,
	"minutes_read" integer DEFAULT 0,
	"pages_read" integer DEFAULT 0,
	"start_page" integer,
	"end_page" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "study_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"topic" varchar(255),
	"course_id" integer,
	"hours" real NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"dashboard_focus" text,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "daily_checkins" DROP CONSTRAINT "uq_daily_checkins_date";--> statement-breakpoint
ALTER TABLE "books" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "gratitude_text" text;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "sleep_hours" real;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "sleep_quality" integer;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "bed_time" varchar(5);--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "wake_time" varchar(5);--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "morning_mood" integer;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "evening_mood" integer;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "day_rating" integer;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "intention" varchar(100);--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "priorities" text;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "tomorrow_note" text;--> statement-breakpoint
ALTER TABLE "daily_goals" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "training_exercises" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "training_plans" ADD COLUMN "user_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_beat_id_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."beats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beats" ADD CONSTRAINT "beats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beats_audio" ADD CONSTRAINT "beats_audio_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beats_audio" ADD CONSTRAINT "beats_audio_beat_id_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."beats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_content" ADD CONSTRAINT "book_content_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "book_content" ADD CONSTRAINT "book_content_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_records" ADD CONSTRAINT "personal_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "books" ADD CONSTRAINT "books_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "courses" ADD CONSTRAINT "courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_goals" ADD CONSTRAINT "daily_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_exercises" ADD CONSTRAINT "training_exercises_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "uq_daily_checkins_user_date" UNIQUE("user_id","date");