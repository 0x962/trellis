ALTER TABLE "review_imports" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "review_imports" CASCADE;--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_wip_limit_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP COLUMN "wip_limit";