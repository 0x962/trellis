import { sql } from "drizzle-orm";

export const assignmentNotRetired = (id: string) =>
	sql`NOT EXISTS (SELECT 1 FROM activity a WHERE a.action='agent.external-retired' AND a.meta->'retirement'->>'source'='persona' AND a.meta->'retirement'->>'id'=${id})`;
