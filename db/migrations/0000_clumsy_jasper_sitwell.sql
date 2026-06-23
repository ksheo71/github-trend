CREATE SCHEMA IF NOT EXISTS "gh_trend";
--> statement-breakpoint
CREATE TABLE "gh_trend"."events_daily" (
	"day" date NOT NULL,
	"repo_id" bigint NOT NULL,
	"watch_events" integer DEFAULT 0 NOT NULL,
	"fork_events" integer DEFAULT 0 NOT NULL,
	"push_events" integer DEFAULT 0 NOT NULL,
	"pr_events" integer DEFAULT 0 NOT NULL,
	"issue_events" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "events_daily_day_repo_id_pk" PRIMARY KEY("day","repo_id")
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."ingest_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."repo_daily_stats" (
	"repo_id" bigint NOT NULL,
	"day" date NOT NULL,
	"stars" integer,
	"forks" integer,
	"watchers" integer,
	"stars_delta" integer,
	CONSTRAINT "repo_daily_stats_repo_id_day_pk" PRIMARY KEY("repo_id","day")
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."repos" (
	"id" bigint PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"description" text,
	"language" text,
	"topics" text[],
	"homepage" text,
	"license" text,
	"stars" integer,
	"forks" integer,
	"open_issues" integer,
	"created_at" timestamp with time zone,
	"pushed_at" timestamp with time zone,
	"fetched_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."trend_keyword" (
	"period" text NOT NULL,
	"keyword" text NOT NULL,
	"mentions" integer NOT NULL,
	"delta_pct" numeric NOT NULL,
	"sample_repo_ids" bigint[] NOT NULL,
	CONSTRAINT "trend_keyword_period_keyword_pk" PRIMARY KEY("period","keyword")
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."trend_language" (
	"period" text NOT NULL,
	"language" text NOT NULL,
	"hot_repo_count" integer NOT NULL,
	"total_stars_gained" bigint NOT NULL,
	CONSTRAINT "trend_language_period_language_pk" PRIMARY KEY("period","language")
);
--> statement-breakpoint
CREATE TABLE "gh_trend"."trend_repo" (
	"period" text NOT NULL,
	"language" text NOT NULL,
	"repo_id" bigint NOT NULL,
	"star_gain" integer DEFAULT 0 NOT NULL,
	"rank_by_star_gain" integer,
	"rank_by_stars" integer,
	CONSTRAINT "trend_repo_period_language_repo_id_pk" PRIMARY KEY("period","language","repo_id")
);
--> statement-breakpoint
ALTER TABLE "gh_trend"."repo_daily_stats" ADD CONSTRAINT "repo_daily_stats_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "gh_trend"."repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rds_day_idx" ON "gh_trend"."repo_daily_stats" USING btree ("day");--> statement-breakpoint
CREATE INDEX "repos_full_name_idx" ON "gh_trend"."repos" USING btree ("full_name");