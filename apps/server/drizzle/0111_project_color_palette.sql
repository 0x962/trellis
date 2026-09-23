-- The palette grows from 5 color names to 25. The check below is the list of
-- `ProjectColorSchema`, and it keeps the 5 older names, so every project that
-- holds a color keeps it.
ALTER TABLE "projects" DROP CONSTRAINT "projects_color_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_color_check" CHECK ("projects"."color" IN ('red', 'brick', 'rust', 'orange', 'amber', 'gold', 'olive', 'moss', 'fern', 'green', 'emerald', 'jade', 'pine', 'teal', 'cyan', 'azure', 'cobalt', 'blue', 'indigo', 'violet', 'purple', 'orchid', 'pink', 'rose', 'crimson'));