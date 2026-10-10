import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

export type WorkspaceControl = {
	controlId: string;
	controllerOwnerEpoch: number;
	defaultHostId: string;
};

const controlColumns = sql`
	id AS "controlId",
	controller_owner_epoch AS "controllerOwnerEpoch",
	default_host_id AS "defaultHostId"
`;

// The one `workspace_control` row. The migration 0152 inserts it.
export const control = async (tx: Tx): Promise<WorkspaceControl> => {
	const found = await rows<WorkspaceControl>(tx, sql`SELECT ${controlColumns} FROM workspace_control`);
	return found[0]!;
};

// Raises the epoch by one when it still equals `expectedEpoch`. One UPDATE
// does the compare and the write, so two controllers that race get one
// winner. The loser receives null.
export const advanceControllerOwnerEpoch = async (
	tx: Tx,
	input: { expectedEpoch: number; now: Date },
): Promise<number | null> => {
	const found = await rows<{ epoch: number }>(
		tx,
		sql`
		UPDATE workspace_control
		SET controller_owner_epoch = controller_owner_epoch + 1, updated_at = ${input.now}
		WHERE controller_owner_epoch = ${input.expectedEpoch}
		RETURNING controller_owner_epoch AS epoch
	`,
	);
	return found[0]?.epoch ?? null;
};

export const setDefaultHost = async (tx: Tx, input: { hostId: string; now: Date }): Promise<WorkspaceControl> => {
	const found = await rows<WorkspaceControl>(
		tx,
		sql`
		UPDATE workspace_control
		SET default_host_id = ${input.hostId}, updated_at = ${input.now}
		RETURNING ${controlColumns}
	`,
	);
	return found[0]!;
};
