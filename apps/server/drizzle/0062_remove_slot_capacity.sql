ALTER TABLE "manager_delegations" DROP CONSTRAINT "manager_delegations_capacity_check";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "manager_config" SET DEFAULT '{"personaId":null,"directory":""}'::jsonb;--> statement-breakpoint
ALTER TABLE "manager_delegations" DROP COLUMN "capacity";--> statement-breakpoint
UPDATE "projects" SET "manager_config" = "manager_config" - 'concurrency' WHERE "manager_config" ? 'concurrency';--> statement-breakpoint
UPDATE "statuses" SET "wip_limit" = 9 WHERE "category" = 'started' AND "wip_limit" IS NULL;
