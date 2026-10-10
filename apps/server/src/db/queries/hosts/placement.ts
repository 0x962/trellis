import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

export type PlacementInputs = {
	workspaceDefaultHostId: string;
	projectDefaultHostId: string | null;
	ticketHostId: string | null;
};

// The three host preferences a placement reads: the ticket, then the
// project, then the workspace. An absent id and a row without a preference
// both give null.
export const placementInputs = async (
	tx: Tx,
	input: { ticketId?: string; projectId?: string } = {},
): Promise<PlacementInputs> => {
	const found = await rows<PlacementInputs>(
		tx,
		sql`
		SELECT
			c.default_host_id AS "workspaceDefaultHostId",
			(SELECT default_host_id FROM projects WHERE id = ${input.projectId ?? null}) AS "projectDefaultHostId",
			(SELECT host_id FROM tickets WHERE id = ${input.ticketId ?? null}) AS "ticketHostId"
		FROM workspace_control c
	`,
	);
	return found[0]!;
};
