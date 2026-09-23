-- A status no longer names who reviews. The statements below drop one column
-- and keep every row: a project that holds both "Agent Review" and "Human
-- Review" keeps two statuses, because a name and a slug are unique inside one
-- project and those two rows differ in both. Every ticket keeps its status_id.
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_reviewer_check";--> statement-breakpoint
ALTER TABLE "statuses" DROP CONSTRAINT "statuses_reviewer_for_review";--> statement-breakpoint
ALTER TABLE "statuses" DROP COLUMN "reviewer";
