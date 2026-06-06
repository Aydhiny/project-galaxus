CREATE TABLE "books" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"author" varchar(255),
	"status" varchar(20) DEFAULT 'reading',
	"pages_total" integer,
	"pages_read" integer DEFAULT 0,
	"started_at" date,
	"completed_at" date,
	"rating" integer,
	"notes" text,
	"cover_color" varchar(7) DEFAULT '#C9A84C',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"platform" varchar(100),
	"instructor" varchar(255),
	"status" varchar(20) DEFAULT 'in_progress',
	"progress" integer DEFAULT 0,
	"started_at" date,
	"completed_at" date,
	"month" integer,
	"year" integer,
	"notes" text,
	"url" varchar(500),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "daily_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"fajr" boolean DEFAULT false,
	"dhuhr" boolean DEFAULT false,
	"asr" boolean DEFAULT false,
	"maghrib" boolean DEFAULT false,
	"isha" boolean DEFAULT false,
	"quran_pages" integer DEFAULT 0,
	"training" boolean DEFAULT false,
	"training_minutes" integer DEFAULT 0,
	"meditation" boolean DEFAULT false,
	"meditation_minutes" integer DEFAULT 0,
	"music" boolean DEFAULT false,
	"music_minutes" integer DEFAULT 0,
	"design" boolean DEFAULT false,
	"youtube" boolean DEFAULT false,
	"writing" boolean DEFAULT false,
	"gratitude" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "uq_daily_checkins_date" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "daily_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true,
	"order_index" integer DEFAULT 0,
	"category" varchar(50) DEFAULT 'general',
	"emoji" varchar(10) DEFAULT '✓',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "goal_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"goal_id" integer,
	"date" date NOT NULL,
	"completed" boolean DEFAULT false,
	CONSTRAINT "uq_goal_completions_goal_date" UNIQUE("goal_id","date")
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"date" date NOT NULL,
	"mood" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_exercises" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer,
	"name" varchar(255) NOT NULL,
	"sets" integer,
	"reps" varchar(50),
	"weight" varchar(50),
	"day" varchar(20),
	"order_index" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "training_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "goal_completions" ADD CONSTRAINT "goal_completions_goal_id_daily_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."daily_goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_exercises" ADD CONSTRAINT "training_exercises_plan_id_training_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."training_plans"("id") ON DELETE cascade ON UPDATE no action;