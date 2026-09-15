import type { AgentRun } from "@trellis/api";
import { sql } from "drizzle-orm";

export const assignmentMatches = (run: AgentRun) =>
	sql`id=${run.id} AND runtime=${run.runtime} AND state=${run.state} AND workspace_id IS NOT DISTINCT FROM ${run.workspaceId} AND terminal_id IS NOT DISTINCT FROM ${run.terminalId} AND session_id IS NOT DISTINCT FROM ${run.sessionId}`;
