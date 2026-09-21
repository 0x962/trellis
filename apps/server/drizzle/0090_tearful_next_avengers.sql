ALTER TABLE "milestones" RENAME TO "waves";--> statement-breakpoint
ALTER TABLE "tickets" RENAME COLUMN "milestone_id" TO "wave_id";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_id_epic_id_unique" TO "waves_id_epic_id_unique";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_epic_id_slug_unique" TO "waves_epic_id_slug_unique";--> statement-breakpoint
ALTER TABLE "tickets" RENAME CONSTRAINT "tickets_milestone_needs_epic" TO "tickets_wave_needs_epic";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_slug_check" TO "waves_slug_check";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_name_check" TO "waves_name_check";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_position_check" TO "waves_position_check";--> statement-breakpoint
ALTER TABLE "tickets" RENAME CONSTRAINT "tickets_milestone_fk" TO "tickets_wave_fk";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_epic_id_epics_id_fk" TO "waves_epic_id_epics_id_fk";--> statement-breakpoint
ALTER TABLE "waves" RENAME CONSTRAINT "milestones_epic_fk" TO "waves_epic_fk";--> statement-breakpoint
ALTER INDEX "tickets_milestone_id_idx" RENAME TO "tickets_wave_id_idx";--> statement-breakpoint
ALTER INDEX "milestones_epic_id_position_idx" RENAME TO "waves_epic_id_position_idx";
