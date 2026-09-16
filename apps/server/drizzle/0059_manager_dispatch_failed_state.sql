ALTER TABLE "manager_dispatches" DROP CONSTRAINT "manager_dispatches_state_check";--> statement-breakpoint
ALTER TABLE "manager_dispatches" ADD CONSTRAINT "manager_dispatches_state_check" CHECK ("manager_dispatches"."state" IN ('pending', 'sending', 'sent', 'unknown', 'canceled', 'failed'));
