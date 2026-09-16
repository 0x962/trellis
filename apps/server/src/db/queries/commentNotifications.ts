import { type SQL, sql } from "drizzle-orm";

export const commentNotifications = (id: SQL) => sql`COALESCE((SELECT jsonb_agg(jsonb_build_object(
	'runId',d.run_id,'personaName',d.persona_name,'state',d.state,'error',d.error) ORDER BY d.id)
	FROM comment_deliveries d WHERE d.comment_id=${id}), '[]'::jsonb)`;
