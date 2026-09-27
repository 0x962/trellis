ALTER TABLE "flow_nodes" ADD COLUMN "review_area" text;--> statement-breakpoint
ALTER TABLE "flow_nodes" ADD CONSTRAINT "flow_nodes_review_area_check" CHECK ("flow_nodes"."review_area" IS NULL OR ("flow_nodes"."kind" = 'gate' AND "flow_nodes"."harness" IS NULL AND "flow_nodes"."review_area" IN ('frontend', 'backend')));
--> statement-breakpoint
WITH changed AS (
 UPDATE flow_nodes SET review_area = CASE title WHEN 'Frontend relevant?' THEN 'frontend' ELSE 'backend' END,
 harness = NULL
 WHERE flow_id IN (SELECT id FROM flows WHERE slug = 'review') AND kind = 'gate'
 AND title IN ('Frontend relevant?', 'Backend relevant?')
 RETURNING flow_id
)
UPDATE flows SET version = version + 1, updated_at = CURRENT_TIMESTAMP
WHERE id IN (SELECT flow_id FROM changed);
