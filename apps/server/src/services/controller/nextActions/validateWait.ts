import type { ManagerWait } from "@trellis/api/contract";
import { sql } from "drizzle-orm";
import { rows } from "../../../db/queries/support.ts";
import type { Tx } from "../../../db/tx.ts";
import { invalidInput } from "../../../errors.ts";
import { ticketState } from "./queries.ts";

export const validateWait = async (tx: Tx, input: { projectId: string; ticketId: string; waitFor: ManagerWait }) => {
	const wait = input.waitFor;
	if (wait.type === "time") return;
	if (wait.type === "dependency") {
		if (wait.ticketId === input.ticketId || !(await ticketState(tx, { ...input, ticketId: wait.ticketId })))
			throw invalidInput("waitFor", "Choose another ticket in this manager's scope as the dependency.");
		return;
	}
	const [question] = await rows(
		tx,
		sql`SELECT id FROM comments
		WHERE id=${wait.commentId} AND ticket_id=${input.ticketId} AND parent_id IS NULL`,
	);
	if (!question) throw invalidInput("waitFor", "Choose a root question on this ticket for a human response.");
};
