-- The palette holds 25 color names. The check below is the list of
-- `ProjectColorSchema`, and it keeps the 5 older names, so every project that
-- holds a color keeps it.
ALTER TABLE "projects" DROP CONSTRAINT "projects_color_check";--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_color_check" CHECK ("projects"."color" IN ('red', 'brick', 'rust', 'orange', 'amber', 'gold', 'olive', 'moss', 'fern', 'green', 'emerald', 'jade', 'pine', 'teal', 'cyan', 'azure', 'cobalt', 'blue', 'indigo', 'violet', 'purple', 'orchid', 'pink', 'rose', 'crimson'));
--> statement-breakpoint
-- Gives a color to every active project that still holds none. One active
-- project holds one name, so the update pairs the free names with the projects
-- that need one. `random()` orders both sides, so no project reads its color
-- off the order of the list. A project that finds no free name keeps NULL, and
-- it draws the grey mark. A project in the archive holds no name, so this
-- update leaves it alone.
WITH free AS (
	SELECT color, row_number() OVER (ORDER BY random()) AS n
	FROM unnest(ARRAY['red', 'brick', 'rust', 'orange', 'amber', 'gold', 'olive', 'moss', 'fern', 'green', 'emerald', 'jade', 'pine', 'teal', 'cyan', 'azure', 'cobalt', 'blue', 'indigo', 'violet', 'purple', 'orchid', 'pink', 'rose', 'crimson']) AS slot(color)
	WHERE color NOT IN (SELECT color FROM projects WHERE color IS NOT NULL AND archived_at IS NULL)
), needs AS (
	SELECT id, row_number() OVER (ORDER BY random()) AS n
	FROM projects
	WHERE color IS NULL AND archived_at IS NULL
)
UPDATE projects SET color = free.color
FROM free, needs
WHERE projects.id = needs.id AND free.n = needs.n;
