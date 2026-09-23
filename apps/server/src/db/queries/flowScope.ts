import { type SQL, sql } from "drizzle-orm";

// Which flows one project asks for. A flow row holds the project it belongs
// to, or null for a flow that applies to every project.
//
// `listFlows` answers `trellis flows list` and `trellis ready` with this
// condition, and the review readiness rule reads it as well. Both read the
// same one, so the glyph the person sees and the answer the agent gets never
// disagree about whether a flow is owed.
//
// `f` is the alias of the `flows` row and `projectId` is the project of the
// ticket or the project the caller asked about.
export const flowAppliesToProject = (f: SQL, projectId: SQL) =>
	sql`(${f}.project_id IS NULL OR ${f}.project_id = ${projectId})`;
