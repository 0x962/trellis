-- Gives a color to every active project that holds none. The five names are
-- five slots, and one active project holds one slot, so the update pairs the
-- free slots with the projects that need one. `random()` orders both sides, so
-- no project reads its color off the order of the list. A project that finds
-- no free slot keeps NULL, and it draws the grey mark. A project in the
-- archive holds no slot, so this update leaves it alone.
WITH free AS (
	SELECT color, row_number() OVER (ORDER BY random()) AS n
	FROM unnest(ARRAY['orange', 'teal', 'blue', 'pink', 'azure']) AS slot(color)
	WHERE color NOT IN (SELECT color FROM projects WHERE color IS NOT NULL AND archived_at IS NULL)
), needs AS (
	SELECT id, row_number() OVER (ORDER BY random()) AS n
	FROM projects
	WHERE color IS NULL AND archived_at IS NULL
)
UPDATE projects SET color = free.color
FROM free, needs
WHERE projects.id = needs.id AND free.n = needs.n;
