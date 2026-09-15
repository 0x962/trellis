ALTER TABLE "personas" ADD COLUMN "color" text DEFAULT 'accent' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_color_check" CHECK ("personas"."color" IN ('fg', 'fg-muted', 'fg-faint', 'accent', 'agent', 'success', 'warning', 'danger'));--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_description_check" CHECK (length("personas"."description") <= 2000);